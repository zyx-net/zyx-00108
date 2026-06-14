# Laboratory Sample Borrowing and Destruction Approval API

实验室样本借还与销毁审批系统 API，基于 JSON 文件存储，支持本地运行。

## 快速开始

### 1. 启动服务

```bash
npm start
```

服务将在 http://localhost:3000 启动。

### 2. 运行集成测试

```bash
npm test
```

## 角色说明

| 角色 | 说明 | Header |
|------|------|--------|
| APPLICANT | 申请人 - 申请借用、归还、续借、销毁样本，撤销自己的待审批申请 | X-User-Role: APPLICANT |
| LIBRARIAN | 库管 - 管理样本、审批借出/归还/续借申请、申请销毁 | X-User-Role: LIBRARIAN |
| SUPERVISOR | 主管 - 审批销毁申请、解冻样本 | X-User-Role: SUPERVISOR |

## 角色权限矩阵

| 操作 | 申请人 | 库管 | 主管 |
|------|--------|------|------|
| 登记样本 | ❌ | ✅ | ❌ |
| 申请借出/归还/续借 | ✅ | ❌ | ❌ |
| 撤销自己的待审批申请 | ✅ | ❌ | ❌ |
| 审批借出/归还 | ❌ | ✅ | ❌ |
| 审批续借 | ❌ | ✅ | ❌ |
| 冻结样本 | ❌ | ✅ | ❌ |
| 解冻样本 | ❌ | ❌ | ✅ |
| 申请销毁 | ✅ | ✅ | ❌ |
| 审批销毁 | ❌ | ❌ | ✅ |
| 导出审计日志 | ❌ | ✅ | ✅ |

## 成功链路示例

### 1. 样本登记 (Librarian)

```bash
curl -X POST http://localhost:3000/api/samples \
  -H "Content-Type: application/json" \
  -H "X-User-Role: LIBRARIAN" \
  -d '{
    "name": "COVID-19 Test Sample #001",
    "category": "Biological",
    "validityPeriod": "2027-12-31",
    "storageLocation": "Freezer A, Shelf 3",
    "registrant": "Dr. Zhang"
  }'
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "SMP-xxx-xxx",
    "name": "COVID-19 Test Sample #001",
    "category": "Biological",
    "validityPeriod": "2027-12-31",
    "storageLocation": "Freezer A, Shelf 3",
    "status": "AVAILABLE",
    "currentHolder": null,
    "version": 1,
    "createdAt": "2026-06-15T00:00:00.000Z"
  }
}
```

### 2. 借出申请 (Applicant)

```bash
curl -X POST http://localhost:3000/api/requests/borrow \
  -H "Content-Type: application/json" \
  -H "X-User-Role: APPLICANT" \
  -d '{
    "sampleId": "SMP-xxx-xxx",
    "applicant": "Researcher Wang",
    "reason": "COVID-19 variant analysis",
    "duration": 7
  }'
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "REQ-xxx-xxx",
    "sampleId": "SMP-xxx-xxx",
    "type": "BORROW",
    "status": "PENDING",
    "applicant": "Researcher Wang",
    "createdAt": "2026-06-15T00:00:00.000Z"
  }
}
```

### 2.1 撤销申请 (Applicant)

申请人可以在申请仍处于 PENDING 状态时撤销自己的申请：

```bash
curl -X POST http://localhost:3000/api/requests/REQ-xxx-xxx/cancel \
  -H "Content-Type: application/json" \
  -H "X-User-Role: APPLICANT" \
  -d '{
    "user": "Researcher Wang",
    "reason": "Changed research plan"
  }'
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "REQ-xxx-xxx",
    "status": "CANCELLED",
    "cancelledAt": "2026-06-15T01:00:00.000Z",
    "cancelReason": "Changed research plan"
  }
}
```

**注意**：
- 只有申请人本人可以撤销自己的申请
- 库管和主管不能替申请人撤销
- 只有 PENDING 状态的申请可以撤销
- 撤销成功后，申请状态变为 CANCELLED
- 样本状态、持有人、到期时间不会被改变

### 3. 审批借出 (Librarian)

```bash
curl -X POST http://localhost:3000/api/requests/REQ-xxx-xxx/approve \
  -H "Content-Type: application/json" \
  -H "X-User-Role: LIBRARIAN" \
  -d '{
    "approver": "Dr. Li",
    "approvalBasis": "Valid research purpose, storage capacity confirmed"
  }'
```

响应：
```json
{
  "success": true,
  "data": {
    "request": {
      "id": "REQ-xxx-xxx",
      "status": "APPROVED",
      "approver": "Dr. Li",
      "approveDate": "2026-06-15T00:00:00.000Z"
    },
    "sample": {
      "id": "SMP-xxx-xxx",
      "status": "BORROWED",
      "currentHolder": "Researcher Wang"
    }
  }
}
```

### 4. 续借申请 (Applicant)

```bash
curl -X POST http://localhost:3000/api/requests/renew \
  -H "Content-Type: application/json" \
  -H "X-User-Role: APPLICANT" \
  -d '{
    "sampleId": "SMP-xxx-xxx",
    "applicant": "Researcher Wang",
    "reason": "Analysis incomplete, need more time",
    "newDuration": 14
  }'
```

### 5. 审批续借 (Librarian)

```bash
curl -X POST http://localhost:3000/api/requests/REQ-xxx-xxx/approve \
  -H "Content-Type: application/json" \
  -H "X-User-Role: LIBRARIAN" \
  -d '{
    "approver": "Dr. Li",
    "approvalBasis": "Research progress verified, extension approved"
  }'
```

### 6. 归还申请 (Applicant)

```bash
curl -X POST http://localhost:3000/api/requests/return \
  -H "Content-Type: application/json" \
  -H "X-User-Role: APPLICANT" \
  -d '{
    "sampleId": "SMP-xxx-xxx",
    "applicant": "Researcher Wang"
  }'
```

### 7. 审批归还 (Librarian)

```bash
curl -X POST http://localhost:3000/api/requests/REQ-xxx-xxx/approve \
  -H "Content-Type: application/json" \
  -H "X-User-Role: LIBRARIAN" \
  -d '{
    "approver": "Dr. Li",
    "approvalBasis": "Sample returned in good condition"
  }'
```

### 8. 销毁申请 (Librarian)

```bash
curl -X POST http://localhost:3000/api/requests/destruction \
  -H "Content-Type: application/json" \
  -H "X-User-Role: LIBRARIAN" \
  -d '{
    "sampleId": "SMP-xxx-xxx",
    "applicant": "Dr. Zhang",
    "reason": "Sample expired",
    "approvalBasis": "Safety regulation: expired samples must be disposed"
  }'
```

### 9. 审批销毁 (Supervisor)

```bash
curl -X POST http://localhost:3000/api/requests/REQ-xxx-xxx/approve-destruction \
  -H "Content-Type: application/json" \
  -H "X-User-Role: SUPERVISOR" \
  -d '{
    "approver": "Prof. Chen",
    "approvalBasis": "Confirmed expired, disposal protocol followed"
  }'
```

### 10. 审计日志导出

```bash
# JSON 格式
curl -X GET "http://localhost:3000/api/audit-logs/export?format=json" \
  -H "X-User-Role: LIBRARIAN" \
  -o audit-logs.json

# CSV 格式
curl -X GET "http://localhost:3000/api/audit-logs/export?format=csv" \
  -H "X-User-Role: SUPERVISOR" \
  -o audit-logs.csv
```

## 错误链路示例

### 1. 冻结样本续借被拒绝

```bash
# 先冻结样本
curl -X POST http://localhost:3000/api/samples/SMP-xxx-xxx/freeze \
  -H "Content-Type: application/json" \
  -H "X-User-Role: LIBRARIAN" \
  -d '{
    "operator": "Dr. Li",
    "reason": "Quality inspection required"
  }'

# 尝试续借冻结的样本
curl -X POST http://localhost:3000/api/requests/renew \
  -H "Content-Type: application/json" \
  -H "X-User-Role: APPLICANT" \
  -d '{
    "sampleId": "SMP-xxx-xxx",
    "applicant": "Researcher Wang",
    "reason": "Need more time",
    "newDuration": 7
  }'
```

响应 (400):
```json
{
  "success": false,
  "error": "Sample is frozen and cannot be renewed"
}
```

### 2. 已销毁样本归还被拒绝

```bash
curl -X POST http://localhost:3000/api/requests/return \
  -H "Content-Type: application/json" \
  -H "X-User-Role: APPLICANT" \
  -d '{
    "sampleId": "SMP-xxx-xxx",
    "applicant": "Researcher Wang"
  }'
```

响应 (400):
```json
{
  "success": false,
  "error": "Sample has been destroyed and cannot be returned"
}
```

### 3. 权限不足

```bash
# 申请人尝试登记样本
curl -X POST http://localhost:3000/api/samples \
  -H "Content-Type: application/json" \
  -H "X-User-Role: APPLICANT" \
  -d '{
    "name": "Test Sample",
    "category": "Test",
    "validityPeriod": "2027-12-31",
    "storageLocation": "Shelf 1",
    "registrant": "Researcher Wang"
  }'
```

响应 (403):
```json
{
  "success": false,
  "error": "Insufficient permissions"
}
```

### 4. 并发销毁审批

当两个 Supervisor 同时审批同一销毁请求时：

```bash
# Supervisor 1
curl -X POST http://localhost:3000/api/requests/REQ-xxx-xxx/approve-destruction \
  -H "Content-Type: application/json" \
  -H "X-User-Role: SUPERVISOR" \
  -d '{
    "approver": "Prof. Chen",
    "approvalBasis": "Approved by Chen"
  }'
# 成功 (200)

# Supervisor 2 (同时执行)
curl -X POST http://localhost:3000/api/requests/REQ-xxx-xxx/approve-destruction \
  -H "Content-Type: application/json" \
  -H "X-User-Role: SUPERVISOR" \
  -d '{
    "approver": "Prof. Liu",
    "approvalBasis": "Approved by Liu"
  }'
# 失败 (409)
```

响应 (409):
```json
{
  "success": false,
  "error": "Request is not pending, current status: APPROVED"
}
```

### 5. 借出已借出的样本

```bash
curl -X POST http://localhost:3000/api/requests/borrow \
  -H "Content-Type: application/json" \
  -H "X-User-Role: APPLICANT" \
  -d '{
    "sampleId": "SMP-xxx-xxx",
    "applicant": "Researcher Zhao",
    "reason": "Need this sample",
    "duration": 7
  }'
```

响应 (400):
```json
{
  "success": false,
  "error": "Sample is not available, current status: BORROWED"
}
```

### 6. 审批非待审批申请

```bash
curl -X POST http://localhost:3000/api/requests/REQ-xxx-xxx/approve \
  -H "Content-Type: application/json" \
  -H "X-User-Role: LIBRARIAN" \
  -d '{
    "approver": "Dr. Li",
    "approvalBasis": "Approved"
  }'
```

响应 (409):
```json
{
  "success": false,
  "error": "Request is not pending, current status: APPROVED"
}
```

### 7. 库管尝试审批销毁请求

库管不能通过普通审批接口审批销毁请求，必须由主管通过专用接口审批：

```bash
# 库管尝试通过普通审批接口审批销毁请求
curl -X POST http://localhost:3000/api/requests/REQ-xxx-xxx/approve \
  -H "Content-Type: application/json" \
  -H "X-User-Role: LIBRARIAN" \
  -d '{
    "approver": "Dr. Li",
    "approvalBasis": "Approved"
  }'
```

响应 (403):
```json
{
  "success": false,
  "error": "Destruction requests must be approved by Supervisor via /approve-destruction endpoint"
}
```

### 8. 撤销已审批的申请

尝试撤销已 APPROVED、REJECTED 或 CANCELLED 的申请会返回 409 冲突错误：

```bash
# 撤销已审批通过的申请
curl -X POST http://localhost:3000/api/requests/REQ-xxx-xxx/cancel \
  -H "Content-Type: application/json" \
  -H "X-User-Role: APPLICANT" \
  -d '{
    "user": "Researcher Wang",
    "reason": "Changed plan"
  }'
```

响应 (409):
```json
{
  "success": false,
  "error": "Request is not pending, current status: APPROVED"
}
```

### 9. 非申请人尝试撤销

库管或主管尝试撤销申请人的申请会返回 403 权限错误：

```bash
# 库管尝试撤销申请人的借出申请
curl -X POST http://localhost:3000/api/requests/REQ-xxx-xxx/cancel \
  -H "Content-Type: application/json" \
  -H "X-User-Role: LIBRARIAN" \
  -d '{
    "user": "Researcher Wang",
    "reason": "Helper cancellation"
  }'
```

响应 (403):
```json
{
  "success": false,
  "error": "Only the applicant can cancel the request"
}
```

### 10. 撤销其他申请人的申请

申请人尝试撤销其他申请人的申请会返回 403 权限错误：

```bash
# Researcher Wang 尝试撤销 Researcher Liu 的申请
curl -X POST http://localhost:3000/api/requests/REQ-xxx-xxx/cancel \
  -H "Content-Type: application/json" \
  -H "X-User-Role: APPLICANT" \
  -d '{
    "user": "Researcher Wang",
    "reason": "Helper cancellation"
  }'
```

响应 (403):
```json
{
  "success": false,
  "error": "Only the applicant can cancel the request"
}
```

## 其他 API 接口

### 查询样本

```bash
# 查询所有样本
curl -X GET http://localhost:3000/api/samples \
  -H "X-User-Role: LIBRARIAN"

# 按状态查询
curl -X GET "http://localhost:3000/api/samples?status=OVERDUE" \
  -H "X-User-Role: LIBRARIAN"

# 查询单个样本
curl -X GET http://localhost:3000/api/samples/SMP-xxx-xxx \
  -H "X-User-Role: LIBRARIAN"
```

### 冻结与解冻

```bash
# 冻结样本 (Librarian)
curl -X POST http://localhost:3000/api/samples/SMP-xxx-xxx/freeze \
  -H "Content-Type: application/json" \
  -H "X-User-Role: LIBRARIAN" \
  -d '{
    "operator": "Dr. Li",
    "reason": "Quality inspection"
  }'

# 解冻样本 (Supervisor)
curl -X POST http://localhost:3000/api/samples/SMP-xxx-xxx/unfreeze \
  -H "Content-Type: application/json" \
  -H "X-User-Role: SUPERVISOR" \
  -d '{
    "operator": "Prof. Chen",
    "reason": "Inspection complete"
  }'
```

### 查询申请

```bash
curl -X GET "http://localhost:3000/api/requests?status=PENDING" \
  -H "X-User-Role: LIBRARIAN"
```

### 查询审计日志

```bash
curl -X GET "http://localhost:3000/api/audit-logs?sampleId=SMP-xxx-xxx" \
  -H "X-User-Role: SUPERVISOR"
```

### 标记逾期样本

```bash
curl -X GET http://localhost:3000/api/samples/overdue/mark \
  -H "X-User-Role: LIBRARIAN"
```

## 数据存储

数据存储在 `data/` 目录下的 JSON 文件中：

- `data/samples.json` - 样本数据
- `data/requests.json` - 申请记录
- `data/audit-logs.json` - 审计日志

服务重启后自动从文件恢复状态。

## 审计记录字段

每条审计日志包含：

| 字段 | 说明 |
|------|------|
| id | 审计记录唯一标识 |
| timestamp | 操作时间 |
| action | 动作类型 |
| user | 执行用户 |
| role | 用户角色 |
| sampleId | 样本ID |
| sampleName | 样本名称 |
| validityPeriod | 有效期 |
| storageLocation | 存放位置 |
| requestId | 相关申请ID |
| details | 详细信息 |
| result | 结果 (SUCCESS/FAILURE) |
| errorMessage | 错误信息 |

## 状态机

### 样本状态转换
```
AVAILABLE ──[借出审批通过]──> BORROWED
BORROWED ──[归还审批通过]──> AVAILABLE
BORROWED ──[逾期]──> OVERDUE
BORROWED ──[续借审批通过]──> BORROWED (更新 dueDate)
BORROWED ──[库管冻结]──> FROZEN
FROZEN ──[主管解冻]──> AVAILABLE (若未借出) 或 BORROWED (若已借出)
ANY ──[销毁审批通过]──> DESTROYED
```

### 申请状态转换
```
PENDING ──[审批通过]──> APPROVED
PENDING ──[审批拒绝]──> REJECTED
PENDING ──[申请人撤销]──> CANCELLED
```

**注意**：撤销申请不会改变样本状态、持有人或到期时间。
