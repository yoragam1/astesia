---
name: laravel-api
description: >-
  Provides architectural patterns for building robust REST APIs using the PHP Laravel framework.
---

# Laravel REST API Architecture

## 1. Metadata
- **Name:** `laravel-api`
- **Origin:** `Astesia Core`
- **Description:** `Provides architectural patterns for building robust REST APIs using the PHP Laravel framework.`

## 2. When to Use
Invoke this skill in the **Engineering Layer** when the chosen backend technology stack is PHP and Laravel.

## 3. Practical Guidance
1. **Form Requests for Validation:** Never validate data directly inside the controller. Always create a dedicated Form Request class (`php artisan make:request`) to encapsulate validation rules and authorization logic.
2. **API Resources for Serialization:** Do not return Eloquent models directly from controllers. Use Eloquent API Resources (`php artisan make:resource`) to format the JSON output, control which fields are exposed, and handle nested relationships.
3. **Thin Controllers:** The controller's only job is to receive the validated request, call a Service class (or directly use Eloquent if the logic is trivial), and return an API Resource.
4. **Service Pattern:** For complex business logic involving multiple steps or external APIs, extract the logic into a Service class rather than keeping it in the controller or model.
5. **Route Prefixing:** Always group API routes under the `api/` prefix and use the `api` middleware group.

## 4. Tested Examples

### ✅ Gold Standard: Laravel API Controller with Request and Resource
```php
<?php
// 1. Form Request (app/Http/Requests/StoreUserRequest.php)
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;

class StoreUserRequest extends FormRequest
{
    public function authorize() { return true; } // Update with real auth logic
    
    public function rules() {
        return [
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8',
        ];
    }
}

// 2. API Resource (app/Http/Resources/UserResource.php)
namespace App\Http\Resources;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray($request) {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            // Explicitly excluding 'password'
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}

// 3. Controller (app/Http/Controllers/Api/UserController.php)
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function store(StoreUserRequest $request)
    {
        // Data is already validated at this point
        $validated = $request->validated();
        
        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
        ]);

        return new UserResource($user);
    }
}
```
