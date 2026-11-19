#include <lcms2.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>

/* All handles and buffers are private to the worker. ICC bytes remain alive
   until cmsCloseProfile, as required by LittleCMS's memory IO interface. */
typedef struct {
    unsigned char *bytes;
    cmsHPROFILE profile, lab, rgb;
    cmsHTRANSFORM to_lab, to_rgb;
    unsigned channels, intent;
} Inspector;

int engine_version(void) { return cmsGetEncodedCMMversion(); }
void engine_close(Inspector *s) {
    if (!s) return;
    if (s->to_lab) cmsDeleteTransform(s->to_lab);
    if (s->to_rgb) cmsDeleteTransform(s->to_rgb);
    if (s->profile) cmsCloseProfile(s->profile);
    if (s->lab) cmsCloseProfile(s->lab);
    if (s->rgb) cmsCloseProfile(s->rgb);
    free(s->bytes); free(s);
}
Inspector *engine_open(const unsigned char *bytes, unsigned size, unsigned intent) {
    if (size < 132 || size > 64*1024*1024 || intent > 3) return NULL;
    Inspector *s = calloc(1, sizeof(*s));
    if (!s) return NULL;
    s->bytes = malloc(size);
    if (!s->bytes) { engine_close(s); return NULL; }
    memcpy(s->bytes, bytes, size);
    s->profile = cmsOpenProfileFromMem(s->bytes, size);
    if (!s->profile) { engine_close(s); return NULL; }
    cmsColorSpaceSignature space = cmsGetColorSpace(s->profile);
    cmsUInt32Number format;
    if (space == cmsSigRgbData) { format=TYPE_RGB_FLT; s->channels=3; }
    else if (space == cmsSigCmykData) { format=TYPE_CMYK_FLT; s->channels=4; }
    else if (space == cmsSigGrayData) { format=TYPE_GRAY_FLT; s->channels=1; }
    else { engine_close(s); return NULL; }
    if (cmsGetDeviceClass(s->profile) == cmsSigLinkClass ||
        cmsGetDeviceClass(s->profile) == cmsSigAbstractClass) {
        engine_close(s); return NULL;
    }
    s->lab=cmsCreateLab4Profile(NULL); s->rgb=cmsCreate_sRGBProfile();
    if (!s->lab || !s->rgb) { engine_close(s); return NULL; }
    /* No BPC: inspect the forward device gamut for the selected ICC intent. */
    s->to_lab=cmsCreateTransform(s->profile,format,s->lab,TYPE_Lab_FLT,intent,cmsFLAGS_NOCACHE);
    s->to_rgb=cmsCreateTransform(s->lab,TYPE_Lab_FLT,s->rgb,TYPE_RGB_FLT,INTENT_RELATIVE_COLORIMETRIC,cmsFLAGS_NOCACHE);
    if (!s->to_lab || !s->to_rgb) { engine_close(s); return NULL; }
    return s;
}
int engine_channels(Inspector *s) { return s ? s->channels : 0; }
int engine_sample(Inspector *s, unsigned density, unsigned start, unsigned count, float *out) {
    if (!s || !out || density<3 || density>21 || count>4096) return 0;
    unsigned total=1;
    for (unsigned c=0;c<s->channels;c++) total*=density;
    if (start>total || count>total-start) return 0;
    for (unsigned i=0;i<count;i++) {
        unsigned index=start+i; float device[4]={0}, lab[3], rgb[3];
        for (unsigned c=0;c<s->channels;c++) {
            device[c]=(float)(index%density)/(density-1);
            if (s->channels==4) device[c]*=100.0f;
            index/=density;
        }
        cmsDoTransform(s->to_lab,device,lab,1);
        cmsDoTransform(s->to_rgb,lab,rgb,1);
        for (unsigned c=0;c<3;c++) {
            if (!isfinite(lab[c]) || !isfinite(rgb[c])) return 0;
            out[i*6+c]=lab[c]; out[i*6+3+c]=rgb[c];
        }
    }
    return count;
}
