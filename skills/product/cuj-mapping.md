# Critical User Journey (CUJ) Mapping

## 1. Metadata
- **Name:** `cuj-mapping`
- **Origin:** `Astesia Core`
- **Description:** `Guides the PM/BA agent on how to define end-to-end user pathways that validate the core value of the product.`

## 2. When to Use
Invoke this skill in the **Product Layer** when defining the "Critical User Journeys" section of the BRD. Use it to ensure that features connect logically from a user's perspective.

## 3. Practical Guidance
1. **Identify the Persona:** Always start the journey from a specific user role (e.g., "As a Guest", "As an Admin").
2. **Define the Goal:** State the ultimate end-state the user wants to achieve.
3. **Map the Happy Path:** Describe the frictionless, step-by-step route to the goal. Assume everything works perfectly.
4. **Map the Sad Path (Optional but Recommended):** Briefly describe the primary failure point and how the user recovers (e.g., credit card declined).
5. **Format:** Keep steps concise. Use narrative flow.

## 4. Tested Examples

### ❌ Anti-Pattern: Feature Listing as a Journey
```markdown
1. User logs in.
2. User sees dashboard.
3. User clicks create product.
4. Product is created.
```
*(This is too generic and doesn't explain the context or goal).*

### ✅ Gold Standard: Narrative CUJ
```markdown
**Journey: E-Commerce Checkout (Guest to Customer)**
* **Persona:** Unregistered Guest
* **Goal:** Purchase a t-shirt and receive an order confirmation.
* **Steps:**
  1. Guest browses the catalog and clicks on "Black T-Shirt".
  2. Guest adds size M to the cart.
  3. Guest proceeds to checkout and chooses "Checkout as Guest".
  4. Guest enters shipping details and credit card information.
  5. Guest clicks "Place Order".
  6. The system processes the payment and displays a success page with an Order ID.
  7. The system sends an email receipt to the Guest.
```
