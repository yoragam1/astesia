# Python FastAPI REST API

## 1. Metadata
- **Name:** `python-fastapi`
- **Origin:** `Astesia Core`
- **Description:** `Provides architectural patterns and best practices for building REST APIs using Python's FastAPI framework.`

## 2. When to Use
Invoke this skill in the **Engineering Layer** when the chosen backend technology stack is Python and FastAPI.

## 3. Practical Guidance
1. **Pydantic for Validation:** Rely entirely on Pydantic models for both request validation and response serialization. Do not perform manual type checking or validation in route handlers.
2. **Dependency Injection:** Use FastAPI's `Depends` for database sessions, authentication, and service injection. This keeps routes clean and makes testing significantly easier.
3. **Layered Architecture:** Even though FastAPI is unopinionated, strictly enforce the `Router -> Service -> Repository` pattern.
4. **Async/Await:** Always use `async def` for route handlers and database calls (e.g., using Async SQLAlchemy or Motor for MongoDB) to maximize concurrency.
5. **Exception Handling:** Use global exception handlers (`@app.exception_handler`) to catch domain-specific errors and convert them to standard HTTP responses, keeping the service layer independent of HTTP constructs.

## 4. Tested Examples

### ✅ Gold Standard: FastAPI Layered Pattern
```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Annotated

# --- 1. Schemas (Pydantic) ---
class UserCreate(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str

# --- 2. Repository (Data Access) ---
class UserRepository:
    def __init__(self, db_session):
        self.db = db_session

    async def create(self, user_data: UserCreate):
        # Implementation to save to DB
        return {"id": 1, "email": user_data.email}
        
    async def get_by_email(self, email: str):
        # DB lookup
        return None

# --- 3. Service (Business Logic) ---
class UserService:
    def __init__(self, repo: UserRepository = Depends(UserRepository)):
        self.repo = repo

    async def register_user(self, user_data: UserCreate):
        existing = await self.repo.get_by_email(user_data.email)
        if existing:
            raise ValueError("Email already exists") # Domain error
        
        # Hash password here
        return await self.repo.create(user_data)

# --- 4. Router (HTTP Handling) ---
router = APIRouter(prefix="/users", tags=["Users"])

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate, 
    service: Annotated[UserService, Depends()]
):
    try:
        user = await service.register_user(user_data)
        return user
    except ValueError as e:
        # Convert domain error to HTTP error
        raise HTTPException(status_code=400, detail=str(e))
```
