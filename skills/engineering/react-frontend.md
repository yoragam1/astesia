# React / Next.js Frontend Architecture

## 1. Metadata
- **Name:** `react-frontend`
- **Origin:** `Astesia Core`
- **Description:** `Provides architectural patterns for building React frontends, specifically focusing on Next.js App Router, state management, and component isolation.`

## 2. When to Use
Invoke this skill in the **Engineering Layer** when the chosen frontend technology is React or Next.js.

## 3. Practical Guidance
1. **Server vs Client Components:** Default to React Server Components (RSC) for data fetching and static content. Only use `"use client"` directives at the leaves of the component tree where interactivity (hooks, state, events) is strictly required.
2. **Dumb UI Components:** Build UI components (buttons, cards, inputs) that only accept props and emit events. They should know nothing about APIs or global state.
3. **Data Fetching:** Isolate data fetching into dedicated service files or custom hooks. Do not embed `fetch()` calls directly inside UI component rendering logic.
4. **Zod Integration:** Use `react-hook-form` paired with `@hookform/resolvers/zod` for robust, schema-driven client-side form validation.
5. **Tailwind via Tokens:** Apply CSS classes strictly based on the `.astesia/design-system.md`. Avoid arbitrary values (e.g., `text-[#123456]`).

## 4. Tested Examples

### ✅ Gold Standard: Next.js RSC with Separated Logic
```tsx
// app/users/page.tsx (Server Component)
import { Suspense } from 'react';
import { getUsers } from '@/services/user.service';
import UserList from './_components/UserList';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default async function UsersPage() {
  // Data fetching handled securely on the server
  const users = await getUsers();

  return (
    <main className="p-spacing-8">
      <h1 className="text-2xl font-heading text-primary mb-spacing-4">User Directory</h1>
      <Suspense fallback={<LoadingSpinner />}>
        {/* Pass data to dumb client or server component */}
        <UserList initialUsers={users} />
      </Suspense>
    </main>
  );
}

// app/users/_components/UserList.tsx (Client Component - if interactivity needed)
"use client";
import { useState } from 'react';
import { User } from '@/types';
import Button from '@/components/ui/Button';

export default function UserList({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState(initialUsers);
  
  // Interactivity logic here
  return (
    <ul className="space-y-spacing-2">
      {users.map(user => (
        <li key={user.id} className="p-spacing-4 bg-surface rounded-md shadow-sm">
           {user.email}
        </li>
      ))}
    </ul>
  );
}
```
