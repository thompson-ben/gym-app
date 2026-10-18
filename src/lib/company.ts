/** The company behind NotchLift, shown wherever UK law expects it (website footer, terms, privacy, emails). */
export const COMPANY = {
  name: "B A Thompson Ltd",
  number: "09468823",
  registeredIn: "England and Wales",
  office: "Market House, Church Street, Harleston, Norfolk, IP20 9BB",
  vat: "GB 243 9504 04",
} as const;

/** The one public contact address (forwarded to the owner). NEXT_PUBLIC_CONTACT_EMAIL can override it. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@notchlift.com";

export const COMPANY_LINE = `NotchLift is a trading name of ${COMPANY.name}, registered in ${COMPANY.registeredIn}, company no. ${COMPANY.number}. Registered office: ${COMPANY.office}. VAT no. ${COMPANY.vat}.`;

/** Who signs the personal check-in email. */
export const FOUNDER_NAME = "Ben";
