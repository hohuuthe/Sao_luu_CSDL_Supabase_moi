# Trien khai Sao_luu_CSDL_Supabase_moi tren Cloudflare Pages

Website nay la static HTML/CSS/JavaScript, nam trong thu muc `web/` va goi GitHub Actions API de dieu khien V4-V7 tren repository `hohuuthe/TOOL_TAO_CSDL_MOI`.

## Cach khuyen nghi: Cloudflare Pages Git integration

1. Dang nhap https://dash.cloudflare.com/ va mo **Workers & Pages**.
2. Chon **Create application > Pages > Import an existing Git repository** (ten nut co the thay doi tuy giao dien Cloudflare).
3. Ket noi GitHub, cho phep Cloudflare truy cap repo `hohuuthe/Sao_luu_CSDL_Supabase_moi`.
4. Cau hinh:
   - Framework preset: **None**
   - Production branch: **main**
   - Root directory: **/** (mac dinh)
   - Build command: **exit 0** (hoac de trong neu cho phep)
   - Build output directory: **web**
   - Project name: `sao-luu-csdl-supabase-moi` (neu con kha dung)
5. Chon **Save and Deploy / Deploy** va kiem tra thanh cong.
6. Cloudflare se cap URL `https://<project-name>.pages.dev`. Sau do day code moi vao `main` se tu dong trien khai.

## Bao mat quan trong

- Khong dat chuoi ket noi Supabase (SOURCE_DB_URL/TARGET_DB_URL), password ma hoa hay token trong GitHub repo cong khai, JS/HTML hoac Cloudflare Pages Variables.
- Secrets Supabase phai o repo chay workflow goc `hohuuthe/TOOL_TAO_CSDL_MOI` theo dung ten cac workflow yeu cau.
- Giao dien web hien dung GitHub fine-grained PAT do nguoi dung nhap trong trinh duyet de goi Actions API. Nen gioi han quyen Actions read/write cho repo goc; khong dung PAT co quyen toan bo tai khoan.
- Khong kich hoat che do phuc hoi V5/V6/V7 khi chua xac minh DATABASE dich.
- Cloudflare Pages Git integration khong can Cloudflare API Token hay Account ID duoc chia se qua chat.

Tai lieu: https://developers.cloudflare.com/pages/framework-guides/deploy-anything/ va https://developers.cloudflare.com/pages/configuration/git-integration/
