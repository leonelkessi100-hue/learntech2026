# Shared components

These components keep the static LearnTech pages consistent without moving the
existing article files or breaking their internal links.

- `responsive.css` handles small-screen text, images, long links, code blocks,
  tables, menus, and card content.
- `navigation.js` adds the accessible mobile-menu button and image enhancements.

Every HTML page loads both files. New pages should do the same:

```html
<link rel="stylesheet" href="./components/responsive.css">
<script src="./components/navigation.js" defer></script>
```
