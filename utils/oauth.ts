import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { API_BASE_URL } from "../constants/Api";
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "../constants/OAuth";
import type { UserProfile, UserProfileData } from "../context/AuthContext";

export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export type OAuthProvider = "google" | "apple";

export class OAuthCancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "OAuthCancelledError";
  }
}

export function isOAuthCancelled(error: unknown) {
  if (error instanceof OAuthCancelledError) return true;
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  return (
    code === "ERR_REQUEST_CANCELED" ||
    code === "ERR_CANCELED" ||
    code === "SIGN_IN_CANCELLED" ||
    code === "12501" ||
    code === "cancelled"
  );
}

export function googleRedirectUri() {
  return AuthSession.makeRedirectUri({
    scheme: "studyspotr",
    path: "google",
  });
}

function paramsFromUrl(url: string) {
  const params: Record<string, string> = {};
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";
  const query =
    queryIndex >= 0
      ? url.slice(
          queryIndex + 1,
          hashIndex >= 0 && hashIndex > queryIndex ? hashIndex : undefined,
        )
      : "";

  for (const part of [query, hash]) {
    if (!part) continue;
    const search = new URLSearchParams(part.replace(/#/g, "&"));
    search.forEach((value, key) => {
      if (value) params[key] = value;
    });
  }
  return params;
}

type NativeGoogleModule = typeof import("@react-native-google-signin/google-signin");

function loadNativeGoogle(): NativeGoogleModule | null {
  try {
    // Lazy require so Expo Go never initializes the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@react-native-google-signin/google-signin");
  } catch {
    return null;
  }
}

export async function getGoogleIdTokenNative(): Promise<{
  idToken: string;
  firstName?: string;
  lastName?: string;
}> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error("Google Sign-In is not configured yet.");
  }

  const native = loadNativeGoogle();
  if (!native) {
    throw new Error("Native Google Sign-In is not available.");
  }

  native.GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    offlineAccess: false,
  });

  if (Platform.OS === "android") {
    await native.GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: true,
    });
  }

  const response = await native.GoogleSignin.signIn();
  if (!native.isSuccessResponse(response)) {
    throw new OAuthCancelledError();
  }

  const idToken = response.data.idToken;
  if (!idToken) {
    throw new Error("Google did not return an ID token.");
  }

  return {
    idToken,
    firstName: response.data.user.givenName ?? undefined,
    lastName: response.data.user.familyName ?? undefined,
  };
}

export async function getAppleIdToken(): Promise<{
  idToken: string;
  nonce?: string;
  firstName?: string;
  lastName?: string;
}> {
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error("Sign in with Apple is not available on this device.");
  }

  const rawNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${Date.now()}-${Math.random()}`,
  );
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error("Apple did not return an identity token.");
  }

  return {
    idToken: credential.identityToken,
    nonce: rawNonce,
    firstName: credential.fullName?.givenName ?? undefined,
    lastName: credential.fullName?.familyName ?? undefined,
  };
}

export async function exchangeOAuthIdToken(params: {
  provider: OAuthProvider;
  idToken?: string;
  nonce?: string;
  firstName?: string;
  lastName?: string;
  code?: string;
  codeVerifier?: string;
  redirectUri?: string;
}): Promise<{
  user: UserProfile | UserProfileData;
  access_token: string;
  refresh_token: string;
  needs_onboarding: boolean;
}> {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/oauth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: params.provider,
      id_token: params.idToken,
      nonce: params.nonce,
      first_name: params.firstName,
      last_name: params.lastName,
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
    }),
  });

  const data = (await res.json().catch(() => null)) as
    | {
        error?: string;
        user?: UserProfile | UserProfileData;
        access_token?: string;
        refresh_token?: string;
        needs_onboarding?: boolean;
      }
    | null;

  if (!res.ok || !data?.user || !data.access_token || !data.refresh_token) {
    throw new Error(data?.error || "Sign-in failed.");
  }

  return {
    user: data.user,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    needs_onboarding: Boolean(data.needs_onboarding),
  };
}

type OAuthSessionResult = {
  user: UserProfile | UserProfileData;
  access_token: string;
  refresh_token: string;
  needs_onboarding: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dismissAuthBrowser() {
  try {
    AuthSession.dismiss();
  } catch {
    try {
      void WebBrowser.dismissBrowser();
    } catch {
      // The iOS auth sheet is closed by the user or by a matching redirect.
    }
  }
}

async function finishGoogleBrowserFlow(
  flowId: string,
): Promise<OAuthSessionResult | "pending"> {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/oauth/google/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flow_id: flowId }),
  });
  const data = (await res.json().catch(() => null)) as
    | {
        error?: string;
        pending?: boolean;
        user?: UserProfile | UserProfileData;
        access_token?: string;
        refresh_token?: string;
        needs_onboarding?: boolean;
      }
    | null;

  if (res.status === 202 || data?.pending) return "pending";
  if (!res.ok || !data?.user || !data.access_token || !data.refresh_token) {
    throw new Error(data?.error || "Sign-in failed.");
  }

  return {
    user: data.user,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    needs_onboarding: Boolean(data.needs_onboarding),
  };
}

export async function signInWithGoogleInBrowser(): Promise<OAuthSessionResult> {
  const startRes = await fetch(`${API_BASE_URL}/api/v1/auth/oauth/google/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const startData = (await startRes.json().catch(() => null)) as {
    url?: string;
    flow_id?: string;
    done_url?: string;
    error?: string;
  } | null;

  if (!startRes.ok || !startData?.url || !startData.flow_id) {
    throw new Error(startData?.error || "Could not start Google sign-in.");
  }

  const authorizeUrl = startData.url;
  const flowId = startData.flow_id;
  const doneUrl =
    startData.done_url || `${API_BASE_URL}/api/v1/auth/oauth/google/done`;
  let settled: OAuthSessionResult | Error | null = null;
  let active = true;

  const poll = (async () => {
    while (active && !settled) {
      await sleep(1000);
      if (!active || settled) break;
      try {
        const result = await finishGoogleBrowserFlow(flowId);
        if (result !== "pending") {
          settled = result;
          dismissAuthBrowser();
        }
      } catch (err) {
        settled = err instanceof Error ? err : new Error("Sign-in failed.");
        dismissAuthBrowser();
      }
    }
  })();

  try {
    const browserResult = await WebBrowser.openAuthSessionAsync(
      authorizeUrl,
      doneUrl,
      { preferEphemeralSession: true },
    );
    if (browserResult.type === "success" && browserResult.url) {
      const params = paramsFromUrl(browserResult.url);
      if (params.error) {
        throw new Error(params.error);
      }
    }
  } catch (err) {
    if (!settled) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/cancel|dismiss/i.test(message)) {
        settled = err instanceof Error ? err : new Error(message);
      }
    }
  }

  for (let i = 0; i < 10 && !settled; i += 1) {
    await sleep(400);
    try {
      const result = await finishGoogleBrowserFlow(flowId);
      if (result !== "pending") settled = result;
    } catch (err) {
      settled = err instanceof Error ? err : new Error("Sign-in failed.");
    }
  }

  active = false;
  await Promise.race([poll, sleep(0)]);

  if (settled instanceof Error) throw settled;
  if (settled) return settled;
  throw new OAuthCancelledError();
}
