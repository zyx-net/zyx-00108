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
| APPLICANT | 申请人 - 申请借用、归还、续借样本 | X-User-Role: APPLICANT |
| LIBRARIAN | 库管 - 管理样本、审批借出/归还/续借申请 | X-User-Role: LIBRARIAN |
| SUPERVISOR | 主管 - 审批销毁申请、解冻样本 | X-User-Role: SUPERVISOR |

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

### 4. 并发销毁审批 (乐观锁冲突)

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
  "error": "Sample was already destroyed by another request"
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

响应 (400):
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

```
AVAILABLE ──[借出审批通过]──> BORROWED
BORROWED ──[归还审批通过]──> AVAILABLE
BORROWED ──[逾期]──> OVERDUE
BORROWED ──[续借审批通过]──> BORROWED (更新 dueDate)
BORROWED ──[库管冻结]──> FROZEN
FROZEN ──[主管解冻]──> AVAILABLE 或 BORROWED
ANY ──[销毁审批通过]──> DESTROYED
```
