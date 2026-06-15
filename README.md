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

## 申请时间线与对账模块

### 概述

申请时间线模块为借出、归还、续借、销毁等申请提供完整的生命周期追踪，记录从创建、审批、撤销到冲突失败的每一步，并保存可查询的快照。

### 主要功能

1. **申请快照**：记录每个申请在每个操作时刻的完整状态快照
2. **事件追踪**：记录所有操作事件，包括创建、审批、拒绝、撤销
3. **安全事件记录**：记录越权访问、身份不匹配、重复操作等安全事件
4. **并发冲突记录**：记录审批与撤销之间的竞争条件
5. **数据导出**：支持 CSV/JSON 格式导出，包含校验和
6. **可配置审计**：支持审计开关、数据保留策略
7. **持久化存储**：服务重启后数据完整保留

### 时间线事件类型

| 事件类型 | 说明 |
|---------|------|
| REQUEST_CREATED | 申请创建 |
| REQUEST_APPROVED | 申请审批通过 |
| REQUEST_REJECTED | 申请审批拒绝 |
| REQUEST_CANCELLED | 申请被撤销 |
| IDENTITY_MISMATCH | 身份不匹配（越权撤销尝试）|
| DUPLICATE_OPERATION | 重复操作（非待审批状态撤销）|
| VERSION_CONFLICT | 版本冲突（并发修改）|
| APPROVAL_CANCEL_RACE | 审批与撤销竞争 |

### API 接口

#### 查询时间线事件

```bash
# 查询所有事件（分页）
curl -X GET "http://localhost:3000/api/timeline?page=1&limit=20" \
  -H "X-User-Role: LIBRARIAN"

# 按申请ID查询
curl -X GET "http://localhost:3000/api/timeline/request/REQ-xxx-xxx" \
  -H "X-User-Role: LIBRARIAN"

# 按筛选条件查询
curl -X GET "http://localhost:3000/api/timeline?user=Researcher Wang&eventType=REQUEST_CANCELLED" \
  -H "X-User-Role: SUPERVISOR"
```

**筛选参数**：
- `requestId`: 按申请ID筛选
- `sampleId`: 按样本ID筛选
- `user`: 按操作者筛选
- `userRole`: 按角色筛选
- `eventType`: 按事件类型筛选
- `startDate`: 开始时间
- `endDate`: 结束时间
- `result`: 结果筛选（SUCCESS/FAILURE）
- `page`: 页码
- `limit`: 每页数量

#### 导出时间线

```bash
# JSON 格式导出
curl -X GET "http://localhost:3000/api/timeline/export?format=json" \
  -H "X-User-Role: LIBRARIAN" \
  -o timeline-events.json

# CSV 格式导出
curl -X GET "http://localhost:3000/api/timeline/export?format=csv" \
  -H "X-User-Role: SUPERVISOR" \
  -o timeline-events.csv
```

#### 查询统计信息

```bash
curl -X GET "http://localhost:3000/api/timeline/stats" \
  -H "X-User-Role: LIBRARIAN"
```

响应示例：
```json
{
  "success": true,
  "data": {
    "totalEvents": 150,
    "eventsByType": {
      "REQUEST_CREATED": 50,
      "REQUEST_APPROVED": 40,
      "REQUEST_CANCELLED": 10,
      "IDENTITY_MISMATCH": 5
    },
    "eventsByResult": {
      "SUCCESS": 145,
      "FAILURE": 5
    },
    "concurrencyConflicts": 2,
    "securityEvents": 5,
    "config": {
      "auditEnabled": true,
      "retentionMaxDays": 365
    }
  }
}
```

#### 审计配置管理

```bash
# 查询当前配置
curl -X GET "http://localhost:3000/api/timeline/config" \
  -H "X-User-Role: LIBRARIAN"

# 更新配置
curl -X PUT "http://localhost:3000/api/timeline/config" \
  -H "Content-Type: application/json" \
  -H "X-User-Role: LIBRARIAN" \
  -d '{
    "auditEnabled": true,
    "retentionMaxDays": 30,
    "retentionMaxRecords": 5000,
    "captureRequestSnapshots": true,
    "captureSampleSnapshots": true
  }'

# 重置为默认配置（仅主管）
curl -X POST "http://localhost:3000/api/timeline/config/reset" \
  -H "X-User-Role: SUPERVISOR"
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| auditEnabled | boolean | true | 是否启用审计 |
| retentionMaxDays | number | 365 | 数据保留天数 |
| retentionMaxRecords | number | 100000 | 最大记录数 |
| captureRequestSnapshots | boolean | true | 是否捕获申请快照 |
| captureSampleSnapshots | boolean | true | 是否捕获样本快照 |
| recordSecurityEvents | boolean | true | 是否记录安全事件 |
| recordConcurrencyConflicts | boolean | true | 是否记录并发冲突 |

### 时间线事件结构

```json
{
  "id": "TLE-xxx-xxx",
  "timestamp": "2026-06-15T10:30:00.000Z",
  "eventType": "REQUEST_CANCELLED",
  "requestId": "REQ-xxx-xxx",
  "sampleId": "SMP-xxx-xxx",
  "user": "Researcher Wang",
  "userRole": "APPLICANT",
  "previousStatus": "PENDING",
  "newStatus": "CANCELLED",
  "requestSnapshot": {
    "id": "REQ-xxx-xxx",
    "sampleId": "SMP-xxx-xxx",
    "type": "BORROW",
    "status": "CANCELLED",
    "version": 2,
    "..."
  },
  "sampleSnapshot": {
    "id": "SMP-xxx-xxx",
    "name": "Sample Name",
    "status": "AVAILABLE",
    "..."
  },
  "details": {
    "requestType": "BORROW",
    "cancelReason": "Changed plan"
  },
  "result": "SUCCESS",
  "errorMessage": null,
  "conflictInfo": null,
  "metadata": {
    "recordedAt": "2026-06-15T10:30:00.000Z",
    "auditEnabled": true,
    "retentionMaxDays": 365
  }
}
```

### 数据持久化

时间线数据存储在 `data/timeline-events.json` 文件中，服务重启后自动恢复。

### 运行测试

```bash
# 运行时间线模块测试
node src/test-timeline.js
```

测试覆盖场景：
1. 普通申请生命周期（借出、审批）
2. 库管发起销毁申请
3. 创建者本人撤销
4. 越权访问检测
5. 重复操作检测
6. 并发冲突处理
7. 统计数据查询
8. 导出功能（JSON/CSV）
9. 服务重启后数据一致性
10. 审计开关切换
11. 配置重置
