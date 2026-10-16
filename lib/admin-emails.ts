/** Match only complete email addresses supplied by the trusted identity provider. */
export function isBootstrapAdmin(email: string, primary?: string, additional?: string) {
  const approved = [primary ?? "", ...(additional ?? "").split(",")]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return approved.includes(email.trim().toLowerCase());
}
