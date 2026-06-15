# 实验室样本借还与销毁审批系统 - 规范文档

## 1. 项目概述

**项目名称**: Laboratory Sample Management API (LabSampleAPI)

**核心功能**: 实验室样本的登记、借出、归还、续借、冻结和销毁审批全流程管理

**目标用户**:
- 申请人 (Applicant): 申请借用、归还、续借样本
- 库管 (Librarian): 管理样本、审批借出/销毁申请
- 主管 (Supervisor): 审批销毁申请、处理异常

## 2. 数据模型

### 2.1 样本 (Sample)
```json
{
  "id": "string",                    // 样本唯一标识
  "name": "string",                  // 样本名称
  "category": "string",             // 样本类别
  "validityPeriod": "string",       // 有效期 (ISO 8601)
  "storageLocation": "string",      // 存放位置
  "status": "string",               // 状态: AVAILABLE, BORROWED, OVERDUE, FROZEN, PENDING_DESTRUCTION, DESTROYED
  "currentHolder": "string|null",   // 当前持有者
  "borrowDate": "string|null",      // 借出日期
  "dueDate": "string|null",         // 应还日期
  "createdAt": "string",            // 创建时间
  "updatedAt": "string",            // 更新时间
  "version": "number"               // 版本号，用于乐观锁
}
```

### 2.2 申请记录 (Request)
```json
{
  "id": "string",                    // 申请唯一标识
  "sampleId": "string",             // 样本ID
  "type": "string",                 // 类型: BORROW, RETURN, RENEW, DESTRUCTION
  "applicant": "string",            // 申请人
  "status": "string",               // 状态: PENDING, APPROVED, REJECTED, CANCELLED
  "approvalBasis": "string",        // 审批依据
  "approver": "string|null",        // 审批人
  "approverRole": "string|null",    // 审批人角色
  "approveDate": "string|null",     // 审批日期
  "reason": "string",               // 申请理由
  "createdAt": "string",            // 创建时间
  "updatedAt": "string"             // 更新时间
}
```

### 2.3 审计日志 (AuditLog)
```json
{
  "id": "string",                    // 日志唯一标识
  "timestamp": "string",            // 时间戳
  "action": "string",               // 动作类型
  "user": "string",                 // 执行用户
  "role": "string",                 // 用户角色
  "sampleId": "string",             // 样本ID
  "sampleName": "string",           // 样本名称
  "validityPeriod": "string",       // 有效期
  "storageLocation": "string",      // 存放位置
  "requestId": "string|null",      // 相关申请ID
  "details": "object",              // 详细信息
  "result": "string",               // 结果: SUCCESS, FAILURE
  "errorMessage": "string|null"    // 错误信息
}
```

## 3. 状态机

### 3.1 样本状态转换
```
AVAILABLE ──[借出审批通过]──> BORROWED
BORROWED ──[归还审批通过]──> AVAILABLE
BORROWED ──[逾期]──> OVERDUE
BORROWED ──[续借审批通过]──> BORROWED (更新 dueDate)
BORROWED ──[库管冻结]──> FROZEN
FROZEN ──[主管解冻]──> AVAILABLE (若未借出) 或 BORROWED (若已借出)
ANY ──[销毁审批通过]──> DESTROYED
```

### 3.2 申请状态转换
```
PENDING ──[审批通过]──> APPROVED
PENDING ──[审批拒绝]──> REJECTED
PENDING ──[申请人撤销]──> CANCELLED
```

## 4. API 接口

### 4.1 样本管理

#### 4.1.1 样本登记 (仅库管)
```
POST /api/samples
Body: { name, category, validityPeriod, storageLocation, registrant }
Response: { success, data: Sample }
```

#### 4.1.2 查询样本
```
GET /api/samples
Query: { status?, category?, page?, limit? }
Response: { success, data: Sample[], total }
```

#### 4.1.3 查询单个样本
```
GET /api/samples/:id
Response: { success, data: Sample }
```

#### 4.1.4 更新样本信息 (仅库管)
```
PUT /api/samples/:id
Body: { storageLocation?, validityPeriod?, updater }
Response: { success, data: Sample }
```

### 4.2 借还流程

#### 4.2.1 申请借出 (申请人)
```
POST /api/requests/borrow
Body: { sampleId, applicant, reason, duration }
Response: { success, data: Request }
```

#### 4.2.2 审批借出 (仅库管)
```
POST /api/requests/:id/approve
Body: { approver, approvalBasis }
Response: { success, data: { request, sample } }
```

#### 4.2.3 撤销申请 (创建者)
```
POST /api/requests/:id/cancel
Body: { user, reason? }
Response: { success, data: Request }
```

**约束**：
- 只有创建者本人可以撤销自己的待审批申请
- 创建者可以是申请人本人（借出/归还/续借场景）或库管（销毁申请场景）
- 只有 PENDING 状态的申请可以撤销
- 撤销后申请状态变为 CANCELLED
- 样本状态、持有人、到期时间不受影响

**错误码**：
- 404: 申请不存在
- 403: 非创建者本人撤销
- 409: 申请状态不是 PENDING

#### 4.2.4 申请归还 (申请人)
```
POST /api/requests/return
Body: { sampleId, applicant }
Response: { success, data: Request }
```

#### 4.2.5 申请续借 (申请人)
```
POST /api/requests/renew
Body: { sampleId, applicant, reason, newDuration }
Response: { success, data: Request }
```

### 4.3 冻结与解冻

#### 4.3.1 冻结样本 (仅库管)
```
POST /api/samples/:id/freeze
Body: { operator, reason }
Response: { success, data: Sample }
```

#### 4.3.2 解冻样本 (仅主管)
```
POST /api/samples/:id/unfreeze
Body: { operator, reason }
Response: { success, data: Sample }
```

### 4.4 销毁流程

#### 4.4.1 申请销毁 (申请人或库管)
```
POST /api/requests/destruction
Body: { sampleId, applicant, reason, approvalBasis }
Response: { success, data: Request }
```

#### 4.4.2 审批销毁 (仅主管)
```
POST /api/requests/:id/approve-destruction
Body: { approver, approvalBasis }
Response: { success, data: { request, sample } }
```

### 4.5 逾期管理

#### 4.5.1 标记逾期 (系统/库管)
```
POST /api/samples/mark-overdue
Response: { success, data: { markedCount } }
```

#### 4.5.2 查询逾期样本
```
GET /api/samples?status=OVERDUE
Response: { success, data: Sample[] }
```

### 4.6 审计功能

#### 4.6.1 查询审计日志
```
GET /api/audit-logs
Query: { sampleId?, user?, action?, startDate?, endDate?, page?, limit? }
Response: { success, data: AuditLog[], total }
```

#### 4.6.2 导出审计日志
```
GET /api/audit-logs/export
Query: { format?, startDate?, endDate?, sampleId? }
Response: File download (JSON/CSV)
```

## 5. 异常场景处理

### 5.1 冻结样本续借
- **场景**: 样本处于 FROZEN 状态时申请续借
- **处理**: 返回错误 "样本已被冻结，无法续借"
- **审计**: 记录失败原因

### 5.2 已销毁样本归还
- **场景**: 样本状态为 DESTROYED 时申请归还
- **处理**: 返回错误 "样本已被销毁，无法归还"
- **审计**: 记录失败原因

### 5.3 并发重复销毁审批
- **场景**: 同一样本的销毁申请被并发审批
- **处理**: 使用乐观锁 (version 字段)，后到的请求返回 "样本状态已变更"
- **审计**: 记录并发冲突

### 5.4 其他异常
- **借出已借出样本**: 返回错误 "样本已被借出"
- **归还未借出样本**: 返回错误 "样本未被借出"
- **审批非待审批申请**: 返回错误 "申请状态不是待审批"
- **权限不足**: 返回错误 "权限不足，需要特定角色"

## 6. 数据完整性保证

### 6.1 事务处理
- 每个操作在失败时必须回滚所有变更
- 使用文件锁或原子写入保证数据一致性

### 6.2 乐观锁
- 样本和申请都有 version 字段
- 更新时检查版本号，不匹配则拒绝操作

### 6.3 审计日志
- 所有操作必须记录审计日志
- 日志在数据操作成功后才写入
- 日志包含操作前后的关键状态

## 7. 数据持久化

### 7.1 存储结构
```
data/
├── samples.json        # 样本数据
├── requests.json       # 申请记录
└── audit-logs.json     # 审计日志
```

### 7.2 重启恢复
- 服务启动时从 JSON 文件加载数据
- 内存状态与文件状态保持一致

## 8. 角色权限

| 操作 | 申请人 | 库管 | 主管 |
|------|--------|------|------|
| 登记样本 | ❌ | ✅ | ❌ |
| 申请借出/归还/续借 | ✅ | ❌ | ❌ |
| 撤销自己的待审批申请（创建者） | ✅ | ✅ | ❌ |
| 审批借出/归还 | ❌ | ✅ | ❌ |
| 审批续借 | ❌ | ✅ | ❌ |
| 冻结样本 | ❌ | ✅ | ❌ |
| 解冻样本 | ❌ | ❌ | ✅ |
| 申请销毁 | ✅ | ✅ | ❌ |
| 审批销毁 | ❌ | ❌ | ✅ |
| 导出审计日志 | ❌ | ✅ | ✅ |

## 9. 验收标准

### 9.1 主流程验证
- [ ] 样本登记成功
- [ ] 借出申请和审批成功
- [ ] 归还申请和审批成功
- [ ] 续借申请和审批成功
- [ ] 逾期标记功能正常
- [ ] 销毁申请和审批成功
- [ ] 审计日志完整记录
- [ ] 审计导出功能正常
- [ ] 创建者撤销自己的待审批申请成功（申请人或库管）
- [ ] 撤销后样本状态不受影响

### 9.2 异常流程验证
- [ ] 冻结样本续借被拒绝
- [ ] 已销毁样本归还被拒绝
- [ ] 并发销毁审批只有一个成功
- [ ] 权限错误被正确返回
- [ ] 撤销非待审批申请返回 409 冲突
- [ ] 非创建者撤销申请返回 403 权限错误
- [ ] 库管可以撤销自己创建的销毁申请
- [ ] 申请人可以撤销自己创建的借出申请

### 9.3 数据一致性验证
- [ ] 失败请求无脏数据
- [ ] 重启后状态正确恢复
- [ ] 审计日志与接口返回一致
- [ ] 撤销操作的审计日志包含操作者、角色、原因、原状态和结果

## 10. 申请时间线模块

### 10.1 功能概述

申请时间线模块为所有申请（借出、归还、续借、销毁）提供完整的生命周期追踪，记录从创建、审批、撤销到冲突失败的每一步。

### 10.2 数据模型

#### 10.2.1 时间线事件 (TimelineEvent)
```json
{
  "id": "string",                    // 事件唯一标识
  "timestamp": "string",            // 时间戳
  "eventType": "string",           // 事件类型
  "requestId": "string|null",      // 相关申请ID
  "sampleId": "string|null",       // 样本ID
  "user": "string|null",           // 操作者
  "userRole": "string|null",       // 操作者角色
  "previousStatus": "string|null",  // 操作前状态
  "newStatus": "string|null",      // 操作后状态
  "requestSnapshot": "object|null", // 申请快照
  "sampleSnapshot": "object|null",  // 样本快照
  "details": "object",              // 详细信息
  "result": "string",               // 结果: SUCCESS, FAILURE
  "errorMessage": "string|null",    // 错误信息
  "conflictInfo": "object|null",    // 冲突信息
  "metadata": "object"              // 元数据
}
```

### 10.3 事件类型

| 事件类型 | 说明 |
|---------|------|
| REQUEST_CREATED | 申请创建 |
| REQUEST_APPROVED | 申请审批通过 |
| REQUEST_REJECTED | 申请审批拒绝 |
| REQUEST_CANCELLED | 申请被撤销 |
| IDENTITY_MISMATCH | 身份不匹配 |
| DUPLICATE_OPERATION | 重复操作 |
| VERSION_CONFLICT | 版本冲突 |
| APPROVAL_CANCEL_RACE | 审批与撤销竞争 |

### 10.4 API 接口

#### 10.4.1 查询时间线事件
```
GET /api/timeline
Query: { requestId?, sampleId?, user?, userRole?, eventType?, startDate?, endDate?, result?, page?, limit? }
Response: { success, data: { events, total, page, limit, totalPages } }
```

#### 10.4.2 按申请查询时间线
```
GET /api/timeline/request/:requestId
Response: { success, data: { events, total } }
```

#### 10.4.3 导出时间线
```
GET /api/timeline/export
Query: { format?, requestId?, sampleId?, user?, userRole?, eventType?, startDate?, endDate?, result? }
Response: File download (JSON/CSV)
```

#### 10.4.4 查询统计
```
GET /api/timeline/stats
Response: { success, data: Statistics }
```

#### 10.4.5 查询审计配置
```
GET /api/timeline/config
Response: { success, data: AuditConfig }
```

#### 10.4.6 更新审计配置
```
PUT /api/timeline/config
Body: AuditConfig
Response: { success, data: AuditConfig }
```

#### 10.4.7 重置审计配置
```
POST /api/timeline/config/reset
Response: { success, data: AuditConfig }
```

### 10.5 审计配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| auditEnabled | boolean | true | 是否启用审计 |
| retentionMaxDays | number | 365 | 数据保留天数 |
| retentionMaxRecords | number | 100000 | 最大记录数 |
| captureRequestSnapshots | boolean | true | 是否捕获申请快照 |
| captureSampleSnapshots | boolean | true | 是否捕获样本快照 |
| recordSecurityEvents | boolean | true | 是否记录安全事件 |
| recordConcurrencyConflicts | boolean | true | 是否记录并发冲突 |

### 10.6 数据持久化

```
data/
├── samples.json            # 样本数据
├── requests.json           # 申请记录
├── audit-logs.json         # 审计日志
└── timeline-events.json    # 时间线事件
```

### 10.7 验收标准

#### 10.7.1 功能验证
- [ ] 申请创建时记录时间线事件
- [ ] 申请审批通过时记录时间线事件
- [ ] 申请审批拒绝时记录时间线事件
- [ ] 申请撤销时记录时间线事件
- [ ] 越权撤销尝试记录为安全事件
- [ ] 重复撤销尝试记录为重复操作事件
- [ ] 并发冲突记录为版本冲突或竞争条件事件

#### 10.7.2 查询验证
- [ ] 支持按申请ID查询
- [ ] 支持按样本ID查询
- [ ] 支持按操作者查询
- [ ] 支持按角色查询
- [ ] 支持按事件类型查询
- [ ] 支持按时间范围查询
- [ ] 支持分页查询

#### 10.7.3 导出验证
- [ ] JSON导出包含校验和
- [ ] CSV导出包含元数据
- [ ] 导出文件可验证完整性

#### 10.7.4 配置验证
- [ ] 审计开关可动态切换
- [ ] 关闭审计不影响主流程
- [ ] 数据保留策略生效
- [ ] 配置可重置为默认值

#### 10.7.5 持久化验证
- [ ] 服务重启后时间线数据完整
- [ ] 重启后查询结果一致
- [ ] 重启后导出结果一致
