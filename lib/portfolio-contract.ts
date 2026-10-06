export const portfolioCompletionMarker='<!--department-portfolio-complete-v1--></body></html>';
export async function validatePortfolioDownload(blob:Blob){
 if(await blob.slice(-portfolioCompletionMarker.length).text()!==portfolioCompletionMarker)throw new Error('لم يكتمل تنزيل ملف الإنجاز ومرفقاته. أعد المحاولة.');
 return blob;
}
