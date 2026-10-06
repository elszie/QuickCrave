/** Small, dependency-free request validators shared by the routes. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Philippine mobile numbers: 09171234567, 639171234567 or +639171234567. */
export const PHONE_RE = /^(?:\+?63|0)9\d{9}$/;
/** GCash / Maya reference numbers are 6-24 letters, digits, dashes or spaces. */
export const EWALLET_REF_RE = /^[A-Za-z0-9-]{6,24}$/;

/** Trimmed text within a length range. */
export function readText(value, label, { min = 1, max = 160 } = {}) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (text.length < min) {
    return { ok: false, error: `${label} is required` };
  }
  if (text.length > max) {
    return { ok: false, error: `${label} must be ${max} characters or fewer` };
  }
  return { ok: true, value: text };
}

export function readEmail(value) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(text)) {
    return { ok: false, error: "Enter a valid email address" };
  }
  return { ok: true, value: text };
}

export function readPassword(value) {
  if (typeof value !== "string" || value.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters" };
  }
  if (value.length > 72) {
    return { ok: false, error: "Password must be 72 characters or fewer" };
  }
  return { ok: true, value };
}

export function readPhone(value) {
  const text = typeof value === "string" ? value.replace(/[\s-]/g, "") : "";
  if (!PHONE_RE.test(text)) {
    return { ok: false, error: "Enter a valid mobile number (e.g. 09171234567)" };
  }
  return { ok: true, value: text };
}

export function readQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return { ok: false, error: "Quantity must be a whole number between 1 and 50" };
  }
  return { ok: true, value: quantity };
}

/** Validates the delivery details sent with an order. */
export function readAddress(body) {
  const address = body && typeof body === "object" ? body : {};
  const checks = {
    label: readText(address.label, "Address label", { max: 40 }),
    recipient: readText(address.recipient, "Recipient name", { max: 80 }),
    phone: readPhone(address.phone),
    street: readText(address.street, "Street address", { max: 160 }),
    city: readText(address.city, "City", { max: 80 }),
  };
  for (const key of ["label", "recipient", "phone", "street", "city"]) {
    if (!checks[key].ok) {
      return { ok: false, error: checks[key].error };
    }
  }
  const notes = readText(address.notes, "Notes", { min: 0, max: 200 });
  if (!notes.ok) {
    return { ok: false, error: notes.error };
  }
  return {
    ok: true,
    value: {
      label: checks.label.value,
      recipient: checks.recipient.value,
      phone: checks.phone.value,
      street: checks.street.value,
      city: checks.city.value,
      notes: notes.value || "",
    },
  };
}

/** Validates the payment selection sent with an order. */
export function readPayment(body, allowedMethods) {
  const payment = body && typeof body === "object" ? body : {};
  const method = typeof payment.paymentMethod === "string" ? payment.paymentMethod : "";
  if (!allowedMethods.includes(method)) {
    return { ok: false, error: "Choose a payment method" };
  }
  if (method === "cod") {
    return { ok: true, value: { method, reference: null } };
  }
  const reference = typeof payment.paymentRef === "string" ? payment.paymentRef.trim() : "";
  if (!EWALLET_REF_RE.test(reference)) {
    return { ok: false, error: "Enter the GCash/Maya reference number (6-24 letters or digits)" };
  }
  return { ok: true, value: { method, reference } };
}
