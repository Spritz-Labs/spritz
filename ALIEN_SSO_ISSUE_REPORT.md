# Alien SSO Integration Issue Report

**Date:** January 8, 2026  
**Project:** Spritz Chat  
**Issue:** `tokenInfo.sub` returns different value on each login

---

## SDK Version

| Package | Version |
|---------|---------|
| `@alien_org/sso-sdk-react` | **1.0.37** |
| `@alien_org/sso-sdk-core` | *(bundled dependency)* |

Installed via:
```bash
npm install @alien_org/sso-sdk-react@1.0.37
```

---

## Provider Configuration

| Setting | Value |
|---------|-------|
| SSO Base URL | `https://sso.alien-api.com` |
| Provider Address | `000000010400000000000ea97cc74f25` |

---

## Summary

The `tokenInfo.sub` field, documented as the "User identifier" in the [Alien SSO React Integration Guide](https://dev.alien.org/docs/sso-guide/react-integration), returns a **different value on each login** for the same user when using **`@alien_org/sso-sdk-react` version 1.0.37**. This prevents us from maintaining consistent user identity across sessions.

---

## Expected Behavior (Per Documentation)

According to the official Alien documentation:

> ```javascript
> {
>   isAuthenticated: boolean;
>   token: string | null;        // Access token
>   tokenInfo: {
>     iss: string;               // Issuer
>     sub: string;               // User identifier  <-- Should be CONSISTENT
>     aud: string | string[];    // Audience (your provider address)
>     exp: number;               // Expiration timestamp
>     iat: number;               // Issued at timestamp
>     nonce?: string;
>     auth_time?: number;
>   } | null;
> }
> ```

The `sub` field is explicitly labeled as "User identifier" and should be consistent across all sessions for the same user.

---

## Actual Behavior

When the same user logs in multiple times, they receive **different `sub` values**:

| Login Attempt | `tokenInfo.sub` Value |
|---------------|----------------------|
| First Login   | `000000010100000000000f7a20fec7b7` |
| Second Login  | `000000010100000000000f7b7d18f8a7` |

This makes it impossible to:
- Maintain user profiles across sessions
- Associate user data with a consistent identifier
- Implement proper authentication persistence

---

## Our Implementation

### Provider Setup (`src/context/AlienAuthProvider.tsx`)

We wrap the app with `AlienSsoProvider` exactly as documented:

```typescript
import { AlienSsoProvider } from '@alien_org/sso-sdk-react';

export function AlienAuthProvider({ children }: { children: ReactNode }) {
    // Get config from environment variables
    const ssoBaseUrl = process.env.NEXT_PUBLIC_ALIEN_SSO_BASE_URL || "https://sso.alien-api.com";
    const providerAddress = process.env.NEXT_PUBLIC_ALIEN_PROVIDER_ADDRESS || "000000010400000000000ea97cc74f25";

    return (
        <AlienSsoProvider
            config={{
                ssoBaseUrl,
                providerAddress,
            }}
        >
            <AlienAuthInner>{children}</AlienAuthInner>
        </AlienSsoProvider>
    );
}
```

### Extracting User Identifier

We extract the `sub` field as the user identifier, following the documentation:

```typescript
const extractAlienAddress = useCallback(
    (token: string | null, tokenInfo: any): string | null => {
        if (!token && !tokenInfo) return null;

        // First, check tokenInfo for sub (the official user identifier per Alien docs)
        if (tokenInfo) {
            console.log(
                "[AlienAuthProvider] Full tokenInfo:",
                JSON.stringify(tokenInfo, null, 2)
            );
            
            // Priority 1: sub - This is the "User identifier" per Alien docs
            // This should be consistent across all sessions for the same user
            if (tokenInfo.sub) {
                console.log(
                    "[AlienAuthProvider] Using sub (User identifier):",
                    tokenInfo.sub
                );
                return tokenInfo.sub;
            }
            
            // Fallback fields in case sub is not available
            if (tokenInfo.user_id) {
                console.log("[AlienAuthProvider] Using user_id:", tokenInfo.user_id);
                return tokenInfo.user_id;
            }
        }

        // Try to decode JWT token to get sub from payload
        if (token) {
            try {
                const parts = token.split(".");
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    
                    // Priority 1: sub from JWT (the user identifier)
                    if (payload.sub) {
                        return payload.sub;
                    }
                    
                    // Fallback
                    if (payload.user_id) return payload.user_id;
                }
            } catch (e) {
                console.error("[AlienAuthProvider] Failed to decode JWT:", e);
            }
        }

        return null;
    },
    []
);
```

### Using the Auth Hook

We access authentication state using `useAuth()` as documented:

```typescript
function AlienAuthInner({ children }: { children: ReactNode }) {
    const { useAuth } = require("@alien_org/sso-sdk-react");
    const alienAuth = useAuth();

    useEffect(() => {
        if (alienAuth.auth.isAuthenticated && alienAuth.auth.token) {
            const tokenInfo = alienAuth.auth.tokenInfo || {};
            const token = alienAuth.auth.token || null;

            // Extract the consistent user identifier (should be tokenInfo.sub per Alien docs)
            let alienAddress = extractAlienAddress(token, tokenInfo);

            // Verify we got the sub field specifically
            if (tokenInfo.sub && alienAddress === tokenInfo.sub) {
                console.log(
                    "[AlienAuthProvider] ✓ Successfully using tokenInfo.sub as user identifier:",
                    alienAddress
                );
            }
            
            // ... store in state and localStorage
        }
    }, [alienAuth.auth.isAuthenticated, alienAuth.auth.token, alienAuth.auth.tokenInfo]);
}
```

---

## Console Logs (Evidence)

### First Login Session

```
[AlienAuthProvider] ========== AUTH STATE UPDATE ==========
[AlienAuthProvider] isAuthenticated: true
[AlienAuthProvider] token exists: true
[AlienAuthProvider] tokenInfo.sub (User identifier): 000000010100000000000f7a20fec7b7
[AlienAuthProvider] tokenInfo.iss (Issuer): https://sso.alien-api.com
[AlienAuthProvider] tokenInfo.aud (Audience): ['000000010400000000000ea97cc74f25']
[AlienAuthProvider] All tokenInfo keys: (6) ['iss', 'sub', 'aud', 'exp', 'iat', 'auth_time']
[AlienAuthProvider] Full tokenInfo: {
  "iss": "https://sso.alien-api.com",
  "sub": "000000010100000000000f7a20fec7b7",
  "aud": [
    "000000010400000000000ea97cc74f25"
  ],
  "exp": 1770566017,
  "iat": 1767974017,
  "auth_time": 1767974006
}
[AlienAuthProvider] ======================================
[AlienAuthProvider] ✓ Successfully using tokenInfo.sub as user identifier: 000000010100000000000f7a20fec7b7
```

### Second Login Session (After Logout)

```
[AlienAuthProvider] ========== AUTH STATE UPDATE ==========
[AlienAuthProvider] isAuthenticated: true
[AlienAuthProvider] token exists: true
[AlienAuthProvider] tokenInfo.sub (User identifier): 000000010100000000000f7b7d18f8a7
[AlienAuthProvider] tokenInfo.iss (Issuer): https://sso.alien-api.com
[AlienAuthProvider] tokenInfo.aud (Audience): ['000000010400000000000ea97cc74f25']
[AlienAuthProvider] All tokenInfo keys: (6) ['iss', 'sub', 'aud', 'exp', 'iat', 'auth_time']
[AlienAuthProvider] Full tokenInfo: {
  "iss": "https://sso.alien-api.com",
  "sub": "000000010100000000000f7b7d18f8a7",
  "aud": [
    "000000010400000000000ea97cc74f25"
  ],
  "exp": 1770566097,
  "iat": 1767974097,
  "auth_time": 1767974087
}
[AlienAuthProvider] ======================================
[AlienAuthProvider] ✓ Successfully using tokenInfo.sub as user identifier: 000000010100000000000f7b7d18f8a7
```

---

## Available Fields in `tokenInfo`

The only fields returned are:

| Field | Description | Value (Example) |
|-------|-------------|-----------------|
| `iss` | Issuer | `https://sso.alien-api.com` |
| `sub` | User identifier (CHANGES!) | `000000010100000000000f7b7d18f8a7` |
| `aud` | Audience (provider address) | `['000000010400000000000ea97cc74f25']` |
| `exp` | Expiration timestamp | `1770566097` |
| `iat` | Issued at timestamp | `1767974097` |
| `auth_time` | Authentication time | `1767974087` |

**No other fields are available** that could serve as a persistent user identifier.

---

## Questions for Alien Support

1. Why does `tokenInfo.sub` return a different value each time the same user logs in?

2. Is there another field or API endpoint we should use to get a consistent, persistent user identifier?

3. Is there additional configuration required on the provider side to enable persistent user identifiers?

4. Is the current behavior intentional for privacy reasons? If so, how should we maintain user state across sessions?

---

## Environment

### Installed Versions

| Dependency | Version |
|------------|---------|
| `@alien_org/sso-sdk-react` | **1.0.37** |
| `next` | 14.2.22 |
| `react` | 18.3.1 |
| `react-dom` | 18.3.1 |
| `@tanstack/react-query` | 5.x |

### Alien SDK Peer Dependencies (from package.json)

| Peer Dependency | Required Version | Our Version |
|-----------------|------------------|-------------|
| `react` | ^19.1.1 | 18.3.1 ⚠️ |
| `react-dom` | ^19.1.1 | 18.3.1 ⚠️ |

> **Note:** We are using React 18.3.1 while the SDK specifies React ^19.1.1 as a peer dependency. However, the SDK appears to function correctly (authentication succeeds, tokens are received). The issue of `sub` changing per session is a server-side behavior, not a client-side React version issue.

### Configuration

| Setting | Value |
|---------|-------|
| SSO Base URL | `https://sso.alien-api.com` |
| Provider Address | `000000010400000000000ea97cc74f25` |
| Framework | Next.js 14 (App Router) |
| Rendering | Client-side (dynamic import with `ssr: false`) |

---

## Contact

Please advise on how to obtain a consistent user identifier across authentication sessions.
