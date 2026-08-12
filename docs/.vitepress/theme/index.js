import DefaultTheme from 'vitepress/theme'
import CTACard from './CTACard.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('CTACard', CTACard)
  },
}
