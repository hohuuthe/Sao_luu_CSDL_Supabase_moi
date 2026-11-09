# Security

## Không đưa secret vào repository web

Không commit các giá trị sau vào `web/`, README, issue hoặc log:

- `SOURCE_DB_URL`
- `TARGET_DB_URL`
- `BACKUP_ENCRYPTION_PASSWORD`
- GitHub PAT

## GitHub PAT

Web chỉ lưu PAT trong `sessionStorage`. Hãy tạo fine-grained PAT chỉ cho `hohuuthe/TOOL_TAO_CSDL_MOI` với quyền tối thiểu Actions read/write và Contents read.

Không dùng classic PAT có quyền toàn tài khoản nếu không cần.

## TARGET

Các thao tác V5, V6 `BACKUP_AND_RESTORE`, V7 `PHUC_HOI_TARGET` có thể ghi vào TARGET. Giao diện có lớp xác nhận bổ sung nhưng không thay thế các hard gate trong workflow nguồn.