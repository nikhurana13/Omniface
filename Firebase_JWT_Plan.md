# OmniFace v2.0 — Firebase JWT Implementation Plan
## Firebase Authentication as the JWT Layer

> **Architecture Decision:** Firebase ID Tokens **ARE** JWTs (RS256, signed by Google).  
> `firebase_admin.auth.verify_id_token()` in [`firebase.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/core/firebase.py) **IS** the JWT verification layer.  
> **No new auth provider. No `python-jose`. No `passlib`. Firebase stays.**

---

## Part 1 — Firebase IS Already JWT

Yeh samajhna zaroori hai ki Firebase ID tokens already proper JWTs hain:

```
Firebase ID Token = JWT
┌──────────────────────────────────────────────────────────┐
│  Header:  { "alg": "RS256", "kid": "<google-key-id>" }   │
│  Payload: {                                               │
│    "sub":           "firebase-uid",    ← User UID        │
│    "email":         "user@email.com",                     │
│    "email_verified": true,                                │
│    "iss":           "https://securetoken.google.com/...", │
│    "aud":           "omniface-aeebd",  ← Project ID      │
│    "iat":           1727000000,                           │
│    "exp":           1727003600,        ← 1 hour lifetime  │
│  }                                                        │
│  Signature: RS256 (Google's private key)                  │
└──────────────────────────────────────────────────────────┘

Backend verify karta hai via:
  firebase_admin.auth.verify_id_token(token)
  ↓
  Google ke public key se signature validate karta hai
  ↓
  Returns decoded claims (uid, email, etc.)
```

**Firebase automatically handles:**
- ✅ Token issuance (login/register → Firebase issues JWT)
- ✅ Token signing (RS256 with Google's managed keys)
- ✅ Token verification (Admin SDK `verify_id_token()`)
- ✅ Token refresh (Firebase SDK auto-refreshes every 1 hour client-side)
- ✅ Token revocation (Admin SDK `revoke_refresh_tokens()`)
- ✅ Brute-force protection (Firebase Rate limiting built-in)
- ✅ Secure cookie-free design (token in `Authorization: Bearer` header)

---

## Part 2 — Current Gap Analysis

### What's ALREADY WORKING

```
Frontend                              Backend
────────                              ───────
Firebase Login                        
  ↓                                   
getIdToken() → Firebase JWT           
  ↓                                   
Authorization: Bearer <token>  ──►   verify_id_token(token)  [firebase.py L56]
                                        ↓
                                      uid = decoded["uid"]
                                        ↓
                                      Firestore queries scoped to uid
```

**Yeh flow pehle se kaam kar raha hai** `analyze.py`, `reports.py`, `jobs.py` mein.

---

### What's MISSING / BROKEN

| Problem | Location | Impact |
|---|---|---|
| **`_get_uid()` triplicate code** | `analyze.py` L235, `reports.py` L37, `jobs.py` L26 | Ek jagah fix karo, teeno jagah fix ho — abhi koi ek jagah change karo teeno ko alag alag update karna padta hai |
| **No `/auth/me` endpoint** | Nowhere on backend | Frontend ko apna profile fetch karne ka koi backend endpoint nahi hai |
| **No user profile in Firestore** | `persistence.py` | `upsert_user()` exist karti hai lekin login par automatically nahi call hoti — user document mein `email`, `name`, `role` nahi store ho raha |
| **No `/auth/logout` (backend)** | Nowhere on backend | Logout sirf client-side Firebase SDK par hai — backend ko server-side revocation ki zaroorat future mein padegi |
| **`localStorage` token storage** | `auth.ts` L113-116 | Security concern — token XSS mein exposed ho sakta hai |
| **No Next.js middleware** | Frontend | Dashboard routes server-side protected nahi hain |

---

## Part 3 — File Status

### ✅ Files That EXIST — Keep As-Is (Do NOT Touch)

| File | Reason to Keep Unchanged |
|---|---|
| [`core/firebase.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/core/firebase.py) | **Yeh hi JWT auth hai.** `verify_id_token()` = JWT verification. Perfect as-is. |
| [`lib/firebase.ts`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Frontend/omniface-__-multimodal-deepfake-forensics/lib/firebase.ts) | Firebase client SDK init — frontend auth ka dil. Mat chhuo. |
| [`lib/api/auth.ts`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Frontend/omniface-__-multimodal-deepfake-forensics/lib/api/auth.ts) | Firebase login/register/logout/getIdToken — sab already correct hai. Minor additions only. |
| `requirements.txt` | Koi naya package add karne ki zaroorat NAHI. Firebase already JWT handle karta hai. |

### ✅ Files That EXIST — Modify Required

| # | File | Change Summary |
|---|---|---|
| 1 | [`core/persistence.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/core/persistence.py) | `get_user_by_uid()` function add karo — `/auth/me` endpoint ke liye |
| 2 | [`models/schemas.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/models/schemas.py) | `UserResponse` schema add karo — `/auth/me` response ke liye |
| 3 | [`routers/analyze.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/routers/analyze.py) | `_get_uid_from_token()` → `Depends(get_current_user)` replace karo |
| 4 | [`routers/reports.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/routers/reports.py) | `_get_uid()` → `Depends(get_current_user)` replace karo |
| 5 | [`routers/jobs.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/routers/jobs.py) | `_get_uid()` → `Depends(get_current_user)` replace karo |
| 6 | [`main.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/main.py) | Auth router register karo |
| 7 | [`lib/api/auth.ts`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Frontend/omniface-__-multimodal-deepfake-forensics/lib/api/auth.ts) | `fetchWithAuth()` interceptor add karo — 401 par auto-retry with fresh token |

### 🆕 Files That DON'T EXIST — Create From Scratch

| # | File | Kya Hoga Isme |
|---|---|---|
| 1 | `Backend/.../app/core/`**`dependencies.py`** | `get_current_user()` FastAPI dependency — `verify_id_token()` call karke user return karega |
| 2 | `Backend/.../app/routers/`**`auth.py`** | `GET /auth/me` + `POST /auth/logout` endpoints |
| 3 | `Frontend/.../`**`middleware.ts`** | Next.js route protection — `/dashboard` routes guard |
| 4 | `Backend/.../tests/`**`test_auth.py`** | Auth endpoint tests |

---

## Part 4 — Phased Implementation Plan

---

### ⚡ Phase 1 — Backend: Centralize Auth + Add Missing Endpoints

**Goal:** Duplicate `_get_uid()` code khatam karo. `/auth/me` endpoint banao. Koi breaking change nahi.

---

#### Step 1.1 — `core/dependencies.py` → CREATE 🆕

**Path:** `Backend/backend/app/core/dependencies.py`

**Kya karega:** Firebase token verify karke ek `UserInfo` object return karega. Teeno existing routers isko use karenge instead of apna-apna `_get_uid()` likhna.

```
get_current_user(authorization: str = Header(None)) → UserInfo
│
├─ Check: authorization header present?
│    └─ NO → raise HTTPException(401, "MISSING_TOKEN")
│
├─ Check: starts with "Bearer "?
│    └─ NO → raise HTTPException(401, "INVALID_TOKEN")
│
├─ Extract token string after "Bearer "
│
├─ Call verify_id_token(token)  ← firebase.py ki existing function
│    └─ Firebase JWT verify karta hai (signature, exp, iss, aud)
│    └─ FAIL → raise HTTPException(401, "INVALID_TOKEN")
│
├─ Extract uid = decoded["uid"]
│    Also extract: email, name (from decoded claims)
│
├─ upsert_user() call karo  ← sync user profile in Firestore on every auth
│    (email, display_name, last_login_at update)
│
└─ Return UserInfo(uid=uid, email=email, name=name)

─────────────────────────────────────────────────────
UserInfo dataclass/model:
  uid: str
  email: str
  name: str
  role: str = "investigator"   ← default; read from Firestore if stored

─────────────────────────────────────────────────────
Dev mode (REQUIRE_AUTH=False):
  authorization header nahi hai → return UserInfo(uid="anonymous", ...)
  (existing behavior preserve karo)
```

> **⚠️ Note:** `get_settings().require_auth` check zaroor karo — existing dev mode behavior break nahi honi chahiye.

---

#### Step 1.2 — `models/schemas.py` → MODIFY ✅

**File:** [`Backend/backend/app/models/schemas.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/models/schemas.py)

Existing schemas chhedo mat. File ke end mein sirf yeh add karo:

```
New schemas to add (append at bottom):
│
├── UserResponse (Pydantic BaseModel)
│     id: str              ← Firebase UID
│     name: str            ← Firebase displayName
│     email: str           ← Firebase email
│     role: str            ← "investigator" | "analyst" | "admin"
│     avatar_url: Optional[str]
│     created_at: Optional[datetime]
│     last_login_at: Optional[datetime]
│     ⚠️ NO password field — Firebase manages credentials
│
└── MessageResponse (Pydantic BaseModel)
      message: str
      ← Used by /auth/logout
```

---

#### Step 1.3 — `core/persistence.py` → MODIFY ✅

**File:** [`Backend/backend/app/core/persistence.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/core/persistence.py)

Existing functions (`upsert_user`, `create_job`, etc.) mat chhuo. Sirf add karo:

```
New functions to add (append at bottom):
│
└── get_user_by_uid(uid: str) → Optional[Dict]
      Reads: users/{uid} Firestore document
      Returns full user dict or None
      In-memory fallback: return _mem_users.get(uid)
      Used by: /auth/me endpoint
```

> `upsert_user()` already exist karti hai — `get_current_user()` dependency us par call karegi har authenticated request par to keep `email`, `display_name`, `last_login_at` synced.

---

#### Step 1.4 — `routers/auth.py` → CREATE 🆕

**Path:** `Backend/backend/app/routers/auth.py`

**Kya hoga isme:** Sirf 2 endpoints. Firebase registration/login frontend par hi hoti hai — backend ko koi register/login endpoint nahi chahiye (Firebase handle karta hai).

```
Endpoints:

GET /auth/me
├─ Depends(get_current_user) → get uid
├─ get_user_by_uid(uid) → Firestore document
│    If None: return profile from JWT claims (uid, email, name)
└─ Return UserResponse (200)

POST /auth/logout
├─ Depends(get_current_user) → get uid
├─ Optional: firebase_admin.auth.revoke_refresh_tokens(uid)
│    ↑ Yeh server-side token revocation karta hai
│    ↑ Requires firebase_admin.auth import (already in firebase.py)
├─ Log logout event
└─ Return MessageResponse {"message": "Logged out successfully."} (200)
```

> **Kyon sirf 2 endpoints?**  
> - `/auth/register` → Firebase `createUserWithEmailAndPassword()` client-side handle karta hai  
> - `/auth/login` → Firebase `signInWithEmailAndPassword()` client-side handle karta hai  
> - `/auth/refresh` → Firebase SDK automatically refresh karta hai client-side  
> - Inhe backend par duplicate karne ki koi zaroorat nahi

---

#### Step 1.5 — `main.py` → MODIFY ✅

**File:** [`Backend/backend/app/main.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/main.py)

Sirf 2 lines change:

```diff
  # Line 56 — imports mein add karo:
- from app.routers import analyze, jobs, reports
+ from app.routers import analyze, auth, jobs, reports

  # Lines 274-278 — router registration mein add karo:
  app.include_router(analyze.router, prefix="/api/v1")
+ app.include_router(auth.router, prefix="/api/v1")
  app.include_router(jobs.router, prefix="/api/v1")
  app.include_router(reports.router, prefix="/api/v1")
```

---

### ⚡ Phase 2 — Refactor Existing Routers

**Goal:** Teeno routers ka duplicate `_get_uid()` code hatao, centralized `get_current_user()` dependency lagao.

---

#### Step 2.1 — `routers/analyze.py` → MODIFY ✅

**File:** [`Backend/backend/app/routers/analyze.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/routers/analyze.py)

```
Changes:
1. Import add karo:
   from app.core.dependencies import get_current_user, UserInfo

2. _get_uid_from_token() function DELETE karo (lines 235–271)
   ↑ Yeh 37 lines ka code dependencies.py mein move ho jayega

3. analyze_media() handler signature change:
   BEFORE: authorization: Optional[str] = Header(None, alias="Authorization")
   AFTER:  current_user: UserInfo = Depends(get_current_user)

4. Inside handler:
   BEFORE: uid = await _get_uid_from_token(authorization)
   AFTER:  uid = current_user.uid
```

---

#### Step 2.2 — `routers/reports.py` → MODIFY ✅

**File:** [`Backend/backend/app/routers/reports.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/routers/reports.py)

```
Changes:
1. Import add karo:
   from app.core.dependencies import get_current_user, UserInfo

2. _get_uid() function DELETE karo (lines 37–52)

3. Char endpoint handlers mein (list_reports, get_report, export_report, get_report_media):
   BEFORE: authorization: Optional[str] = Header(None, alias="Authorization")
           uid = await _get_uid(authorization)
   AFTER:  current_user: UserInfo = Depends(get_current_user)
           uid = current_user.uid
```

---

#### Step 2.3 — `routers/jobs.py` → MODIFY ✅

**File:** [`Backend/backend/app/routers/jobs.py`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Backend/backend/app/routers/jobs.py)

```
Changes:
1. Import add karo:
   from app.core.dependencies import get_current_user, UserInfo

2. _get_uid() function DELETE karo (lines 26–41)

3. get_job_status() handler:
   BEFORE: authorization: Optional[str] = Header(None, alias="Authorization")
           uid = await _get_uid(authorization)
   AFTER:  current_user: UserInfo = Depends(get_current_user)
           uid = current_user.uid
```

> **After Phase 2:** `pytest Backend/backend/tests/` chalaao — verify karo sab tests pass ho rahe hain.

---

### ⚡ Phase 3 — Frontend Wiring

**Goal:** Frontend properly 401 handle kare, auto-refresh kare, routes protect ho.

---

#### Step 3.1 — `lib/api/auth.ts` → MODIFY ✅

**File:** [`Frontend/.../lib/api/auth.ts`](file:///c:/Users/HP/OneDrive/Desktop/Omniface%20version%202.0/Frontend/omniface-__-multimodal-deepfake-forensics/lib/api/auth.ts)

**Existing code ko mat chhuo** — sirf yeh cheezein ADD karo:

```
1. fetchWithAuth(url, options) → Response  [NEW FUNCTION]
   ├─ getIdToken() se fresh token lo (Firebase auto-refresh karta hai)
   ├─ Authorization: Bearer <token> header lagao
   ├─ fetch() karo
   ├─ If response.status === 401:
   │    └─ getIdToken(forceRefresh=true) → force a fresh Firebase token
   │    └─ Retry request once with new token
   ├─ If still 401: logout() call karo + redirect to /login
   └─ Return response

2. getProfile() → UserResponse  [NEW FUNCTION]
   ├─ fetchWithAuth('/api/v1/auth/me')
   └─ Return parsed UserResponse
   
3. serverLogout() → void  [NEW FUNCTION]
   ├─ fetchWithAuth('/api/v1/auth/logout', { method: 'POST' })
   └─ Notify backend to revoke Firebase refresh tokens server-side
   
   (existing logout() already calls Firebase signOut() — 
    serverLogout() sirf backend ko notify karta hai)
```

**`localStorage` Token Note:**  
Existing `localStorage.setItem(TOKEN_KEY, token)` ko is phase mein change karne ki zaroorat NAHI. Firebase SDK internally apna token manage karta hai — `getIdToken()` hamesha fresh token return karta hai automatically. `localStorage` mein jo token store hai woh fallback hai, primary source Firebase SDK memory hai.

---

#### Step 3.2 — `middleware.ts` → CREATE 🆕

**Path:** `Frontend/omniface-__-multimodal-deepfake-forensics/middleware.ts`

```
Logic:
│
├─ Protected path prefixes:
│    ['/dashboard']  ← sab dashboard sub-routes cover ho jaate hain
│
├─ On each request to protected path:
│    Read Firebase auth cookie / token from request
│    ↓
│    If no auth signal → redirect('/login')
│    If auth present  → NextResponse.next()
│
└─ Export config:
     matcher: ['/dashboard/:path*']
     ↑ Middleware sirf dashboard routes par run karega, baaki par nahi

Note: Next.js middleware edge runtime mein run karta hai —
Firebase Admin SDK available nahi hota.
Strategy: Check for presence of token in cookie/session (not verify).
Full verification backend par hoti hai jab API call hoti hai.
```

---

#### Step 3.3 — `tests/test_auth.py` → CREATE 🆕

**Path:** `Backend/backend/tests/test_auth.py`

```
Test cases to write (mock Firebase verify_id_token):
│
├─ TestGetCurrentUserDependency
│    - test_valid_firebase_token → returns UserInfo
│    - test_missing_header → 401 MISSING_TOKEN
│    - test_invalid_token → 401 INVALID_TOKEN
│    - test_expired_token → 401 (Firebase raises InvalidIdTokenError)
│    - test_require_auth_false → returns anonymous when no header
│
├─ TestAuthMeEndpoint
│    - test_me_with_valid_token → 200 UserResponse
│    - test_me_no_token → 401
│    - test_me_user_not_in_firestore → returns data from JWT claims
│
└─ TestAuthLogoutEndpoint
     - test_logout_valid → 200 {"message": "Logged out successfully."}
     - test_logout_no_token → 401
```

---

## Part 5 — Final Summary

```
╔══════════════════════════════════════════════════════════════════╗
║           FIREBASE JWT IMPLEMENTATION — TOTAL SCOPE              ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  🚫 ZERO new auth providers                                      ║
║  🚫 ZERO new packages (no python-jose, no passlib)               ║
║  🚫 ZERO changes to firebase.py                                  ║
║  🚫 ZERO changes to lib/firebase.ts                              ║
║                                                                  ║
║  ✅ Firebase ID tokens = JWTs (already working)                  ║
║  ✅ verify_id_token() = JWT verification (already working)       ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  FILES TO CREATE (4):                                            ║
║    core/dependencies.py   ← centralized auth dependency          ║
║    routers/auth.py        ← /auth/me + /auth/logout only         ║
║    middleware.ts          ← Next.js route guard                  ║
║    tests/test_auth.py     ← auth test suite                      ║
║                                                                  ║
║  FILES TO MODIFY (7):                                            ║
║    core/persistence.py    ← get_user_by_uid() add                ║
║    models/schemas.py      ← UserResponse add                     ║
║    routers/analyze.py     ← _get_uid_from_token() → Depends()   ║
║    routers/reports.py     ← _get_uid() → Depends()              ║
║    routers/jobs.py        ← _get_uid() → Depends()              ║
║    main.py                ← auth router register                 ║
║    lib/api/auth.ts        ← fetchWithAuth() add                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### Quick-Start Order

```
1. core/dependencies.py banao    ← PEHLE — sab iske upar depend hai
2. models/schemas.py modify karo ← UserResponse add karo
3. core/persistence.py modify karo ← get_user_by_uid() add karo
4. routers/auth.py banao         ← /auth/me + /auth/logout
5. main.py update karo           ← router register karo
6. routers/analyze.py refactor   ← _get_uid_from_token() hatao
7. routers/reports.py refactor   ← _get_uid() hatao
8. routers/jobs.py refactor      ← _get_uid() hatao
9. pytest chalaao                ← regression check
10. lib/api/auth.ts update karo  ← fetchWithAuth() add karo
11. middleware.ts banao          ← route protection
12. test_auth.py banao           ← auth tests
```

---

> **Key Insight:**  
> Firebase `verify_id_token()` pehle se hi JWT verification kar raha hai.  
> Yeh plan sirf **code organization** improve karta hai — auth ki nahi.  
> Firebase hi auth hai. Aur tha. Aur rahega. ✅
