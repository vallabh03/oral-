/** Match only complete email addresses supplied by the trusted identity provider. */
export function isBootstrapEmail(email: string, additional?: string) {
  const approved = (additional ?? "").split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return approved.includes(email.trim().toLowerCase());
}

export function isBootstrapAdmin(email: string, primary?: string, additional?: string) {
  return isBootstrapEmail(email, [primary ?? "", additional ?? ""].join(","));
}
