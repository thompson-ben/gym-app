/** The company behind NotchLift, shown wherever UK law expects it (website footer, terms, privacy). */
export const COMPANY = {
  name: "B A Thompson Ltd",
  number: "09468823",
  registeredIn: "England and Wales",
  office: "Market House, Church Street, Harleston, Norfolk, IP20 9BB",
  vat: "GB 243 9504 04",
} as const;

export const COMPANY_LINE = `NotchLift is a trading name of ${COMPANY.name}, registered in ${COMPANY.registeredIn}, company no. ${COMPANY.number}. Registered office: ${COMPANY.office}. VAT no. ${COMPANY.vat}.`;
