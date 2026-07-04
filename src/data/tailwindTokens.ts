import type { TokenDict } from "../types/types";

export const tailwindDict: TokenDict = {
  fixed: {
    title: "fixed",
    summary: "固定定位, 元素相对于浏览器窗口定位.",
    detail: "页面滚动时元素不会移动, 常用于 Floating Button, Toast, Modal 等.",
  },

  "right-4": {
    title: "right-4",
    summary: "距离右边 1rem.",
    detail: "对应 CSS: right: 1rem; 常用于固定右侧位置.",
  },

  "bottom-4": {
    title: "bottom-4",
    summary: "距离底部 1rem.",
    detail: "对应 CSS: bottom: 1rem; 常用于固定底部位置.",
  },

  hover: {
    title: "hover",
    summary: "鼠标悬停状态.",
    detail: "只有鼠标放到元素上时才生效.",
  },

  "bg-slate-100": {
    title: "bg-slate-100",
    summary: "浅灰背景色.",
    detail: "bg 表示 background, slate-100 是 Tailwind 的浅灰色.",
  },

  active: {
    title: "active",
    summary: "鼠标按下状态.",
    detail: "只有鼠标按住元素时才会生效. 常用于按钮按压反馈.",
  },

  "scale-95": {
    title: "scale-95",
    summary: "缩小到 95%.",
    detail: "使用 CSS transform: scale(0.95), 常用于模拟按钮按下时的视觉反馈.",
  },
  dark: {
    title: "dark",
    summary: "深色模式状态.",
    detail: "只有当应用或系统处于 Dark Mode 时才会生效. 常用于适配深色主题.",
  },

  md: {
    title: "md",
    summary: "中等屏幕及以上生效.",
    detail: "响应式断点. 当屏幕宽度达到 md (默认 768px) 及以上时应用该样式.",
  },
  grid: {
    title: "grid",
    summary: "Grid 布局.",
    detail: "使用 CSS Grid 进行二维布局.",
  },

  h: {
    title: "h",
    summary: "高度.",
    detail: "对应 CSS 的 height.",
  },

  w: {
    title: "w",
    summary: "宽度.",
    detail: "对应 CSS 的 width.",
  },

  p: {
    title: "p",
    summary: "内边距.",
    detail: "对应 CSS 的 padding.",
  },

  z: {
    title: "z",
    summary: "层级.",
    detail: "对应 CSS 的 z-index.",
  },

  bg: {
    title: "bg",
    summary: "背景.",
    detail: "通常用于设置 background-color.",
  },

  text: {
    title: "text",
    summary: "文字.",
    detail: "用于设置文字颜色、字体大小等.",
  },

  border: {
    title: "border",
    summary: "边框.",
    detail: "对应 CSS 的 border.",
  },

  opacity: {
    title: "opacity",
    summary: "透明度.",
    detail: "对应 CSS 的 opacity.",
  },

  transition: {
    title: "transition",
    summary: "过渡动画.",
    detail: "指定哪些 CSS 属性具有过渡效果.",
  },

  duration: {
    title: "duration",
    summary: "动画持续时间.",
    detail: "对应 CSS 的 transition-duration.",
  },

  cursor: {
    title: "cursor",
    summary: "鼠标指针.",
    detail: "对应 CSS 的 cursor.",
  },

  scale: {
    title: "scale",
    summary: "缩放.",
    detail: "对应 CSS 的 transform: scale(...).",
  },

  "touch-none": {
    title: "touch-none",
    summary: "禁用触摸手势.",
    detail: "对应 touch-action: none.",
  },

  "place-items-center": {
    title: "place-items-center",
    summary: "Grid 内容居中.",
    detail: "同时设置 align-items 和 justify-items 为 center.",
  },

  "rounded-full": {
    title: "rounded-full",
    summary: "完全圆角.",
    detail: "常用于圆形按钮、头像等.",
  },

  transparent: {
    title: "transparent",
    summary: "透明.",
    detail: "表示透明颜色.",
  },

  "leading-none": {
    title: "leading-none",
    summary: "无额外行高.",
    detail: "对应 line-height: 1.",
  },

  "ease-out": {
    title: "ease-out",
    summary: "缓出动画.",
    detail: "动画开始较快, 结束较慢.",
  },

  pointer: {
    title: "pointer",
    summary: "手型鼠标.",
    detail: "表示元素通常可点击.",
  },

  grabbing: {
    title: "grabbing",
    summary: "抓取鼠标.",
    detail: "通常用于拖拽过程中.",
  },
};
