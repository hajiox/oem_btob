export type TrialPrepaymentIssuer = { name:string; address:string; email:string; registrationNumber:string; bankName:string; branchName:string; accountType:string; accountNumber:string; accountHolder:string }
export type TrialPrepaymentSnapshot = { version:1; invoiceNumber:string; leadId:string; companyName:string; contactName:string; description:string; taxableAmount:number; taxAmount:number; grossAmount:number; companyKey:string; issuedDate:string; dueDate:string; issuer:TrialPrepaymentIssuer; taxRate:10; specialIngredientNote:string; trialOnly:true }
export type TrialPrepayment = { id:string; lead_id:string; company_key:string; identity_evidence:string; claim_included:boolean; taxable_amount:number; tax_amount:number; gross_amount:number; status:'awaiting_payment'|'paid'|'void'; created_at:string; paid_at?:string|null }
export type TrialPrepaymentInvoice = { id:string; prepayment_id:string; lead_id:string; invoice_number:string; snapshot:TrialPrepaymentSnapshot; issued_at:string; lifecycle_status:'active'|'void' }
export const TRIAL_PREPAYMENT_INITIAL_NET=5000
export const TRIAL_PREPAYMENT_INITIAL_TAX=500
export const TRIAL_PREPAYMENT_INITIAL_GROSS=5500
export const TRIAL_PREPAYMENT_NORMAL_NET=10000
export const TRIAL_PREPAYMENT_NORMAL_TAX=1000
export const TRIAL_PREPAYMENT_NORMAL_GROSS=11000
export function trialPrepaymentAmounts(claimIncluded:boolean){return claimIncluded?{taxableAmount:TRIAL_PREPAYMENT_INITIAL_NET,taxAmount:TRIAL_PREPAYMENT_INITIAL_TAX,grossAmount:TRIAL_PREPAYMENT_INITIAL_GROSS}:{taxableAmount:TRIAL_PREPAYMENT_NORMAL_NET,taxAmount:TRIAL_PREPAYMENT_NORMAL_TAX,grossAmount:TRIAL_PREPAYMENT_NORMAL_GROSS}}
export function trialPrepaymentCanStart(status:string,received:number,expected:number){return status==='paid'&&received===expected}
