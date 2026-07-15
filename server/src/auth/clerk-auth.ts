import { createClerkClient, verifyToken } from "@clerk/backend";
import { createHttpError } from "../helpers/create-error";

interface ClerkIdentity {
  userId: string;
  email: string;
}

/** Verify a Clerk session token and return its verified user identity. */
export async function verifyClerkSessionToken(token: string): Promise<ClerkIdentity> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw createHttpError(500, "CLERK_SECRET_KEY is not configured on the server.");
  }

  let claims: { sub?: unknown; email?: unknown };
  try {
    claims = await verifyToken(token, { secretKey });
  } catch {
    throw createHttpError(401, "Clerk session token is invalid or expired. Please sign in again.");
  }

  if (typeof claims.sub !== "string" || !claims.sub) {
    throw createHttpError(401, "Clerk session token does not identify a user. Please sign in again.");
  }

  if (typeof claims.email === "string" && claims.email) {
    return { userId: claims.sub, email: claims.email };
  }

  const clerkClient = createClerkClient({ secretKey });
  let clerkUser;
  try {
    clerkUser = await clerkClient.users.getUser(claims.sub);
  } catch {
    throw createHttpError(401, "Could not load your Clerk profile. Please sign in again.");
  }

  const primaryEmail = clerkUser.emailAddresses.find(
    (emailAddress) =>
      emailAddress.id === clerkUser.primaryEmailAddressId &&
      emailAddress.verification?.status === "verified",
  )?.emailAddress;
  if (!primaryEmail) {
    throw createHttpError(400, "Your Clerk account needs a verified primary email address before you can sign in.");
  }

  return { userId: claims.sub, email: primaryEmail };
}
