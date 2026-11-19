/* Synthetic test data, not a manufacturer's printer profile. */
#include <lcms2.h>
#include <stdio.h>
static int subtractive(const cmsUInt16Number in[],cmsUInt16Number out[],void *cargo){
    float rgb[3];cmsCIELab lab;
    for(int i=0;i<3;i++)rgb[i]=(1-in[i]/65535.0f)*(1-in[3]/65535.0f);
    cmsDoTransform((cmsHTRANSFORM)cargo,rgb,&lab,1);cmsFloat2LabEncoded(out,&lab);return 1;
}
int main(void){
    cmsToneCurve *gamma=cmsBuildGamma(NULL,2.2);
    cmsHPROFILE gray=cmsCreateGrayProfile(cmsD50_xyY(),gamma);cmsFreeToneCurve(gamma);
    if(!gray||!cmsSaveProfileToFile(gray,"tests/fixtures/gray.icc"))return 1;cmsCloseProfile(gray);
    cmsHPROFILE rgb=cmsCreate_sRGBProfile(),lab=cmsCreateLab4Profile(NULL);
    cmsHTRANSFORM convert=cmsCreateTransform(rgb,TYPE_RGB_FLT,lab,TYPE_Lab_DBL,INTENT_RELATIVE_COLORIMETRIC,0);
    cmsHPROFILE p=cmsCreateProfilePlaceholder(NULL);cmsSetProfileVersion(p,4.3);
    cmsSetDeviceClass(p,cmsSigOutputClass);cmsSetColorSpace(p,cmsSigCmykData);cmsSetPCS(p,cmsSigLabData);
    cmsSetHeaderRenderingIntent(p,INTENT_PERCEPTUAL);cmsWriteTag(p,cmsSigMediaWhitePointTag,cmsD50_XYZ());
    cmsMLU *desc=cmsMLUalloc(NULL,1);cmsMLUsetASCII(desc,"en","US","Synthetic CMYK regression fixture");cmsWriteTag(p,cmsSigProfileDescriptionTag,desc);cmsMLUfree(desc);
    cmsPipeline *pipeline=cmsPipelineAlloc(NULL,4,3);cmsStage *clut=cmsStageAllocCLut16bit(NULL,5,4,3,NULL);
    if(!cmsStageSampleCLut16bit(clut,subtractive,convert,0))return 2;
    cmsToneCurve *identity=cmsBuildGamma(NULL,1),*ins[4]={identity,identity,identity,identity},*outs[3]={identity,identity,identity};
    cmsPipelineInsertStage(pipeline,cmsAT_END,cmsStageAllocToneCurves(NULL,4,ins));
    cmsPipelineInsertStage(pipeline,cmsAT_END,clut);
    cmsPipelineInsertStage(pipeline,cmsAT_END,cmsStageAllocToneCurves(NULL,3,outs));cmsFreeToneCurve(identity);
    if(!cmsWriteTag(p,cmsSigAToB0Tag,pipeline)||!cmsSaveProfileToFile(p,"tests/fixtures/synthetic-cmyk.icc"))return 3;
    cmsPipelineFree(pipeline);cmsCloseProfile(p);cmsDeleteTransform(convert);cmsCloseProfile(rgb);cmsCloseProfile(lab);return 0;
}
