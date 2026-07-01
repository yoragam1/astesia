# Frontend Integration

## 1. Metadata
- **Name:** `frontend-integration`
- **Origin:** `Astesia Core`
- **Description:** `Guides the Engineering agent in correctly connecting UI components with business logic and design tokens without tightly coupling them.`

## 2. When to Use
Invoke this skill in the **Engineering Layer** when implementing frontend components, regardless of the framework (React, Vue, Svelte).

## 3. Practical Guidance
1. **Dumb Components:** UI components (buttons, inputs, cards) must be "dumb". They receive data via props and emit actions via events/callbacks. They should NOT fetch data directly or manage complex global state.
2. **Logic Abstraction:** Extract data fetching, complex state management, and business rules into custom hooks (React/Vue) or separate service files. Keep the component file focused strictly on rendering logic and UI state (like `isOpen` for a modal).
3. **Design Token Strictness:** Never use arbitrary CSS values or inline styles (e.g., `color: #ff0000`). All styling MUST map directly to the tokens defined in `.astesia/design-system.md` (e.g., `text-primary`, `bg-surface`).
4. **Boundary Validation:** When receiving data from the backend API, validate the payload structure using Zod before passing it down to components to prevent silent UI failures on malformed data.

## 4. Tested Examples

### ❌ Anti-Pattern: Tightly Coupled Logic
```tsx
// Bad: The UI component fetches data, handles errors, and uses hardcoded colors.
export default function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(res => res.json())
      .then(data => setUser(data));
  }, [userId]);

  if (!user) return <div style={{ color: '#999' }}>Loading...</div>;

  return <div style={{ backgroundColor: '#f0f0f0' }}>{user.name}</div>;
}
```

### ✅ Gold Standard: Abstracted Logic & Tokenized Styling
```tsx
// Good: Data fetching is extracted, styling uses tokens.
import { useUser } from '@/hooks/useUser';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function UserProfile({ userId }) {
  // Logic abstracted to a custom hook
  const { user, isLoading, error } = useUser(userId);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <div className="text-error font-body">{error.message}</div>;
  if (!user) return null;

  // UI rendering uses Tailwind classes mapped to design system tokens
  return (
    <div className="bg-surface p-spacing-4 rounded-md shadow-sm">
      <h2 className="text-primary font-heading text-lg">{user.name}</h2>
    </div>
  );
}
```
