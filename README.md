# HNam IAM Worker 🔐

> Identity & Access Management (IAM) Serverless chạy trên **Cloudflare Workers** (V8 Isolate Edge).  
> Cung cấp máy chủ xác thực và phân quyền tập trung chuẩn **OAuth 2.0** và **OpenID Connect (OIDC)** kết hợp **PKCE (S256)**.

**Worker URL:** `https://iam.hnamhocit.workers.dev`

---

## 🚀 Tính năng chính

- 🌐 **OIDC Discovery & JWKS:** Hỗ trợ chuẩn `/.well-known/openid-configuration` và `/.well-known/jwks.json` cho phép client tự động nhận diện cấu hình.
- 🔑 **OAuth 2.0 Authorization Server:**
  - Authorization Code Flow kết hợp PKCE (`S256`) chống đánh cắp mã Authorization Code.
  - Cấp phát Access Token (JWT ký bằng RS256/HS256) và Refresh Token.
  - Endpoint lấy thông tin người dùng: `GET /oauth/userinfo`.
- 🏢 **Dynamic Client Registration:** Đăng ký ứng dụng client mới qua `POST /api/clients`.
- ⚡ **Siêu nhanh & Bảo mật cao:** Chạy trên nền tảng Cloudflare Workers, kết nối Supabase Postgres an toàn.

---

## 📡 Danh sách Endpoints

| Endpoint | Method | Chức năng |
|---|---|---|
| `/.well-known/openid-configuration` | `GET` | Cấu hình OIDC Discovery tự động |
| `/.well-known/jwks.json` | `GET` | Public Keys xác thực chữ ký JWT |
| `/oauth/authorize` | `GET` | Giao diện đăng nhập & đồng ý cấp quyền |
| `/oauth/token` | `POST` | Đổi mã authorization code lấy token |
| `/oauth/userinfo` | `GET` | Trả về thông tin hồ sơ tài khoản |
| `/api/clients` | `POST` | Đăng ký ứng dụng OAuth Client mới |
| `/health` | `GET` | Kiểm tra trạng thái máy chủ IAM |

---

## 🛠️ Triển khai (Deploy)

### 1. Cấu hình biến môi trường
Tạo file `.dev.vars` từ file mẫu:
```bash
cp .dev.vars.example .dev.vars
```

### 2. Triển khai lên Cloudflare
```bash
bun run deploy
# hoặc: npx wrangler deploy
```

Thiết lập các secret nhạy cảm:
```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put VNTEZ_JWT_SECRET
```
