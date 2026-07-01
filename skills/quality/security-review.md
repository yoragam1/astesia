# Skill: Comprehensive Security Review

## 1. Metadata
- **Name:** `security-review`
- **Origin:** `Arene (Adapted for Astesia IDE Agent)`
- **Description:** Use this skill when adding authentication, handling user input, working with secrets, creating API endpoints, or implementing payment/sensitive features. Provides comprehensive security checklist and patterns.

## 2. When to Activate
- Implementing authentication or authorization
- Handling user input or file uploads
- Creating new API endpoints
- Working with secrets or credentials
- Integrating third-party APIs

## 3. Security Checklist

### 1. Secrets Management
#### FAIL: NEVER Do This
```typescript
const apiKey = "sk-proj-xxxxx"  // Hardcoded secret
const dbPassword = "password123" // In source code
```
#### PASS: ALWAYS Do This
```typescript
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
```
- [ ] No hardcoded API keys, tokens, or passwords
- [ ] All secrets in environment variables

### 2. Input Validation
#### Always Validate User Input
```typescript
import { z } from 'zod'
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100)
})
```
- [ ] All user inputs validated with schemas (Zod/TypeBox)
- [ ] File uploads restricted (size, type, extension)

### 3. SQL Injection Prevention
#### FAIL: NEVER Concatenate SQL
```typescript
const query = `SELECT * FROM users WHERE email = '${userEmail}'` // VULNERABLE
```
#### PASS: ALWAYS Use Parameterized Queries (or ORMs like Drizzle)
```typescript
await db.query('SELECT * FROM users WHERE email = $1', [userEmail])
```

### 4. Authentication & Authorization
#### JWT Token Handling
```typescript
// FAIL: WRONG: localStorage (vulnerable to XSS)
localStorage.setItem('token', token)

// PASS: CORRECT: httpOnly cookies
res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Secure; SameSite=Strict`)
```
- [ ] Tokens stored in httpOnly cookies
- [ ] Authorization role checks before sensitive operations

### 5. XSS Prevention
#### Sanitize HTML
```typescript
import DOMPurify from 'isomorphic-dompurify'
const clean = DOMPurify.sanitize(userHtml)
```
- [ ] User-provided HTML sanitized
- [ ] CSP headers configured

### 6. CSRF Protection
- [ ] CSRF tokens on state-changing operations
- [ ] SameSite=Strict on all cookies

### 7. Rate Limiting
- [ ] Rate limiting on all API endpoints (especially auth routes)

### 8. Sensitive Data Exposure
- [ ] No passwords or tokens in console.log
- [ ] Error messages generic for users (no stack traces exposed)

## 4. Pre-Deployment Security Checklist
Before handing off to DevOps:
- [ ] **Secrets**: No hardcoded secrets, all in env vars
- [ ] **Input Validation**: All user inputs validated
- [ ] **SQL Injection**: All queries parameterized / ORM used properly
- [ ] **XSS**: User content sanitized
- [ ] **Authentication**: Proper token handling (HttpOnly cookies)
- [ ] **Authorization**: Role checks in place
- [ ] **Error Handling**: No sensitive data in errors
