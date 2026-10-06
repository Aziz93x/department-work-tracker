/** Staff identifiers alone ignore leading zeros. Section and learner IDs retain them. */
export function normalizeDigits(value:string){return value.normalize('NFKC').trim().replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))}
export function canonicalStaffNumber(value:string|null|undefined){return value?normalizeDigits(value).replace(/^0+(?=\d)/,''):null}
export function courseIdentity(code:string,number:string){return normalizeDigits(code).replace(/\s+/g,'').toUpperCase()+'\0'+normalizeDigits(number)}
export function normalizeReportTerm(term:string){return term==='144710'||term==='الفصل التدريبي الأول 1448'?'1448-1':term}
