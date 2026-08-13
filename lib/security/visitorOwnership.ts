/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const VISITOR_COOKIE_NAME = "erc_visitor";
const TOKEN_VERSION = "v1";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type VisitorOwnership = {
  visitorId: string;
  cookieHeader?: string;
};

function base64Url(input: Buffer) {
  return input.toString("base64url");
}

function getSecret() {
  const secret =
    process.env.VISITOR_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("VISITOR_TOKEN_SECRET must be configured with at least 32 characters");
  }

  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function parseCookieHeader(header: string | null) {
  const cookies = new Map<string, string>();

  for (const part of header?.split(";") ?? []) {
    const [name, ...valueParts] = part.trim().split("=");

    if (!name || valueParts.length === 0) {
      continue;
    }

    cookies.set(name, decodeURIComponent(valueParts.join("=")));
  }

  return cookies;
}

function buildToken(secret: string) {
  const payload = `${TOKEN_VERSION}.${secret}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const [version, secret, signature] = token.split(".");

  if (version !== TOKEN_VERSION || !secret || !signature) {
    return null;
  }

  if (!/^[A-Za-z0-9_-]{32,96}$/.test(secret)) {
    return null;
  }

  const payload = `${version}.${secret}`;
  const expected = sign(payload);

  return safeEqual(signature, expected) ? secret : null;
}

export function getVisitorIdFromSecret(secret: string) {
  return createHash("sha256").update(`visitor:${secret}`).digest("hex");
}

export function getVerifiedVisitorId(request: Request) {
  const token = parseCookieHeader(request.headers.get("cookie")).get(
    VISITOR_COOKIE_NAME
  );
  const secret = verifyToken(token);

  return secret ? getVisitorIdFromSecret(secret) : null;
}

export function getOrCreateVisitorOwnership(request: Request): VisitorOwnership {
  const existing = getVerifiedVisitorId(request);

  if (existing) {
    return { visitorId: existing };
  }

  const secret = base64Url(randomBytes(32));
  const token = buildToken(secret);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookieHeader = `${VISITOR_COOKIE_NAME}=${encodeURIComponent(
    token
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`;

  return {
    visitorId: getVisitorIdFromSecret(secret),
    cookieHeader,
  };
}

export function jsonWithVisitorOwnership(
  body: unknown,
  ownership: VisitorOwnership,
  init?: ResponseInit
) {
  const response = Response.json(body, init);

  if (ownership.cookieHeader) {
    response.headers.append("Set-Cookie", ownership.cookieHeader);
  }

  return response;
}

export function normalizeUuid(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    trimmed
  )
    ? trimmed
    : null;
}

export async function getOwnedConversationId(
  supabase: any,
  conversationId: unknown,
  visitorId: string
) {
  const id = normalizeUuid(conversationId);

  if (!id) {
    return null;
  }

  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("id", id)
    .eq("visitor_id", visitorId)
    .single();

  if (error || !data?.id) {
    return null;
  }

  return data.id as string;
}
