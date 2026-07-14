import DefaultTheme from 'vitepress/theme';

// Extends (doesn't replace) the default theme — required as soon as
// docs/.vitepress/theme/ exists at all, even though GalleryDemo.vue/
// PlaygroundDemo.vue (Prompt 188) are only ever imported directly by the
// .md pages that use them (docs/gallery.md, docs/playground.md), not
// registered as global components here.
export default DefaultTheme;
