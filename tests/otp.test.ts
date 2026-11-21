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
  OTP_MAX_LENGTH,
  OTP_MIN_LENGTH,
  isUnconfirmedEmailError,
  normaliseOtp,
  otpErrorCopy,
  otpProblem,
} from "../src/lib/otp.ts";

test("normaliseOtp keeps digits only and caps at the maximum accepted length", () => {
  assert.equal(normaliseOtp(" 123 456 "), "123456");
  assert.equal(normaliseOtp("12-34-56"), "123456");
  assert.equal(normaliseOtp("12345678901234"), "1234567890", "extra digits cannot create a longer code");
  assert.equal(normaliseOtp("abc"), "");
  assert.equal(normaliseOtp(""), "");
});

test("otpProblem refuses empty and short codes, and accepts both 6- and 8-digit codes", () => {
  assert.match(otpProblem("") ?? "", /Enter the code/);
  assert.match(otpProblem("12345") ?? "", /at least 6 digits/);
  assert.equal(otpProblem("123456"), null);
  assert.equal(otpProblem("43984357"), null, "this project issues 8-digit codes; 6 must not be hardcoded");
  assert.equal(otpProblem("123 456"), null, "spacing is normalised before validation");
  assert.equal(OTP_MIN_LENGTH, 6);
  assert.ok(OTP_MAX_LENGTH >= 8, "the maximum must cover the 8-digit codes this project issues");
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

test("the demo code is a well-formed code within the accepted range", () => {
  assert.ok(DEMO_OTP.length >= OTP_MIN_LENGTH && DEMO_OTP.length <= OTP_MAX_LENGTH);
  assert.match(DEMO_OTP, /^\d+$/);
  assert.equal(otpProblem(DEMO_OTP), null);
});