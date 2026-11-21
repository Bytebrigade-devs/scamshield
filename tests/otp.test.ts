/**
 * M2 OTP helper tests — password reset by emailed code depends on these.
 *
 * Pinned: input is digits-only and capped, a short code is refused with usable copy, known
 * Supabase error codes get our wording, unknown ones keep the server message (never a vague
 * "something went wrong"), and only `email_not_confirmed` offers a signup confirmation resend.
 *
 * Runner: node --test with type stripping, matching tests/vault-model.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_OTP,
  OTP_LENGTH,
  isUnconfirmedEmailError,
  normaliseOtp,
  otpErrorCopy,
  otpProblem,
} from "../src/lib/otp.ts";

test("normaliseOtp keeps digits only and caps the length", () => {
  assert.equal(normaliseOtp(" 123 456 "), "123456");
  assert.equal(normaliseOtp("12-34-56"), "123456");
  assert.equal(normaliseOtp("12345678"), "123456", "extra digits cannot create a longer code");
  assert.equal(normaliseOtp("abc"), "");
  assert.equal(normaliseOtp(""), "");
});

test("otpProblem refuses empty and short codes, accepts exactly six digits", () => {
  assert.match(otpProblem("") ?? "", /Enter the code/);
  assert.match(otpProblem("12345") ?? "", /6 digits/);
  assert.equal(otpProblem("123456"), null);
  assert.equal(otpProblem("123 456"), null, "spacing is normalised before validation");
  assert.equal(OTP_LENGTH, 6);
});

test("otpErrorCopy replaces known codes and otherwise keeps the server message", () => {
  assert.match(otpErrorCopy("otp_expired", "Token has expired or is invalid"), /expired or was already used/);
  assert.match(otpErrorCopy("over_email_send_rate_limit", "Email rate limit exceeded"), /Too many emails/);
  assert.match(otpErrorCopy("over_request_rate_limit", "Request rate limit reached"), /Too many attempts/);
  assert.equal(
    otpErrorCopy("unexpected_code", "Something specific from the server"),
    "Something specific from the server",
    "an unknown code must not be replaced by vague copy",
  );
  assert.equal(otpErrorCopy(undefined, "Server message"), "Server message");
});

test("only an unconfirmed email offers the confirmation resend", () => {
  assert.equal(isUnconfirmedEmailError({ code: "email_not_confirmed" }), true);
  assert.equal(isUnconfirmedEmailError({ code: "invalid_credentials" }), false);
  assert.equal(isUnconfirmedEmailError(null), false);
  assert.equal(isUnconfirmedEmailError(undefined), false);
});

test("the demo code is a well-formed six-digit code", () => {
  assert.equal(DEMO_OTP.length, OTP_LENGTH);
  assert.match(DEMO_OTP, /^\d{6}$/);
  assert.equal(otpProblem(DEMO_OTP), null);
});