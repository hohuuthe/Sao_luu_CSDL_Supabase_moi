# Sao_luu_CSDL_Supabase_moi

Web Control Center để chạy và giám sát **V4–V7 mới nhất** của repository `hohuuthe/TOOL_TAO_CSDL_MOI` mà không cần mở trang GitHub Actions trong quá trình sử dụng thường ngày.

## Kiến trúc

Web **không nhân bản** các workflow V4–V7. Nó gọi trực tiếp các file đang ở `TOOL_TAO_CSDL_MOI/main`:

| Phiên bản | Workflow nguồn | Chức năng |
|---|---|---|
| V4 | `Sao_luu_cau_truc_CSDL_V4.yml` | Sao lưu cấu trúc SOURCE, không chứa table data, tạo SQL V4 |
| V5 | `Sao_luu_va_phuc_hoi_cau_truc_CSDL_V5.yml` | Sao lưu + kiểm thử local + phục hồi cấu trúc vào TARGET |
| V6 | `Sao_luu_va_phuc_hoi_du_lieu_CSDL_V6.yml` | DATA-only: kiểm tra local / backup artifact / backup + restore TARGET |
| V7 | `Phuc_hoi_file_sao_luu_du_lieu_V7.yml` | Chọn artifact V6, kiểm tra/giải mã/local test rồi tùy chọn restore TARGET |

Ưu điểm của cách này: khi V4–V7 được sửa trên `main`, web luôn gọi bản mới nhất, không tồn tại bản workflow sao chép bị cũ.

## Chức năng web

- Kết nối `hohuuthe/TOOL_TAO_CSDL_MOI` bằng fine-grained GitHub PAT.
- Kiểm tra 4/4 workflow tồn tại, đang active và còn tương thích với các input mà web sử dụng.
- Chạy V4 trực tiếp.
- Chạy V5 với mã xác nhận `PHUC_HOI_V5` và lớp xác nhận bổ sung trước khi ghi TARGET.
- V6 có đủ 3 chế độ:
  - `KIEM_TRA_LOCAL`
  - `BACKUP_ONLY`
  - `BACKUP_AND_RESTORE` — bắt buộc `PHUC_HOI_DATA_V6`
- V7 tự tìm các run V6 manual thành công có artifact `V6-FULL-DATA-ENCRYPTED`; không cần người dùng vào GitHub để tìm Run ID.
- V7 hỗ trợ `KIEM_TRA_LOCAL` và `PHUC_HOI_TARGET`; chế độ restore bắt buộc `PHUC_HOI_BACKUP_V7`.
- Theo dõi run theo thời gian thực, xem 20 lượt gần nhất, hủy run đang chạy.
- Tải log ZIP, GitHub Actions artifact ngay trên web.
- Tải file SQL V4/V5 mới nhất từ repository nguồn.
- Hiển thị thời gian theo múi giờ Việt Nam.
- Responsive cho máy tính và điện thoại.

## Bảo mật

- Web không nhận `SOURCE_DB_URL`, `TARGET_DB_URL` hay `BACKUP_ENCRYPTION_PASSWORD`.
- Các secret vẫn nằm trong GitHub Actions Secrets của `TOOL_TAO_CSDL_MOI`.
- PAT điều khiển GitHub chỉ lưu trong `sessionStorage`, tự mất khi phiên/tab kết thúc hoặc khi bấm **Ngắt**.
- Không dùng script, font hoặc CDN bên thứ ba.
- V5, V6 restore và V7 restore có xác nhận hai lớp ở giao diện trước khi dispatch.
- Web không tự thay đổi nội dung workflow V4–V7.

## PAT tối thiểu

Tạo fine-grained PAT chỉ cấp cho repository `hohuuthe/TOOL_TAO_CSDL_MOI`:

- **Actions: Read and write** — dispatch, theo dõi, hủy run, đọc log/artifact.
- **Contents: Read** — kiểm tra tương thích workflow và tải SQL V4/V5.
- Metadata read là quyền mặc định cần thiết của repository token.

Không cấp quyền rộng hơn nếu không cần.

## Cấu hình Secrets ở repo workflow nguồn

Các secret vẫn được cấu hình một lần tại `hohuuthe/TOOL_TAO_CSDL_MOI`:

- V4: `SOURCE_DB_URL`.
- V5: `SOURCE_DB_URL`, `TARGET_DB_URL`.
- V6: `SOURCE_DB_URL`; `TARGET_DB_URL` khi restore; `BACKUP_ENCRYPTION_PASSWORD` khi tạo artifact/restore (tối thiểu 20 ký tự theo workflow).
- V7: `BACKUP_ENCRYPTION_PASSWORD`; `SOURCE_DB_URL` + `TARGET_DB_URL` khi `PHUC_HOI_TARGET`.

## Triển khai GitHub Pages

Repository web dự kiến: `hohuuthe/Sao_luu_CSDL_Supabase_moi`.

Workflow `.github/workflows/pages.yml` triển khai thư mục `web/` lên GitHub Pages. URL mặc định sau khi Pages được bật:

`https://hohuuthe.github.io/Sao_luu_CSDL_Supabase_moi/`

Repository web không chứa secret nên có thể để public nếu cần dùng GitHub Pages trên plan không hỗ trợ Pages cho private repository.

## Lưu ý vận hành

- Trước khi chạy V5/V6 restore/V7 restore, luôn kiểm tra SOURCE và TARGET.
- V5 yêu cầu TARGET mới/trống và khác SOURCE theo workflow nguồn.
- V6 `BACKUP_ONLY` và `BACKUP_AND_RESTORE` bắt buộc artifact mã hóa.
- V7 luôn kiểm tra gói backup và phục hồi thử local trước khi ghi TARGET.
- Web chỉ là bảng điều khiển; toàn bộ `pg_dump`, `psql`, Supabase CLI, mã hóa và phục hồi vẫn chạy trên GitHub-hosted runner của workflow nguồn.