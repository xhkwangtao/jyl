const QUESTIONS = [
  { id: 'q1', text: '黄崖关长城有哪些主要景点？', category: 'scenic', isHot: true },
  { id: 'q2', text: '太平寨在哪里？', category: 'scenic', isNew: true },
  { id: 'q3', text: '八卦城有什么特色？', category: 'scenic' },
  { id: 'q4', text: '水关的历史背景是什么？', category: 'scenic' },
  { id: 'q5', text: '推荐一条适合老人的游览路线', category: 'route', isHot: true },
  { id: 'q6', text: '从入口到黄崖正关怎么走？', category: 'route' },
  { id: 'q7', text: '全程游览需要多长时间？', category: 'route', isHot: true },
  { id: 'q8', text: '有没有无障碍通道？', category: 'route' },
  { id: 'q9', text: '附近有停车场吗？', category: 'service' },
  { id: 'q10', text: '哪里可以用餐？', category: 'service', isHot: true },
  { id: 'q11', text: '景区开放时间是什么时候？', category: 'service', isNew: true },
  { id: 'q12', text: '门票价格是多少？', category: 'service' },
  { id: 'q13', text: '黄崖关的历史有多久了？', category: 'culture' },
  { id: 'q14', text: '戚继光与黄崖关有什么关系？', category: 'culture', isHot: true },
  { id: 'q15', text: '这里发生过哪些重要战役？', category: 'culture' },
  { id: 'q16', text: '最近有什么活动吗？', category: 'activity', isNew: true },
  { id: 'q17', text: '可以在这里拍照打卡吗？', category: 'activity' },
  { id: 'q18', text: '有导游讲解服务吗？', category: 'activity' }
]

Component({
  properties: {
    visible: {
      type: Boolean,
      value: true
    },
    initialExpanded: {
      type: Boolean,
      value: false
    },
    maxCollapsedCount: {
      type: Number,
      value: 3
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },

  data: {
    isExpanded: false,
    selectedCategory: 'all',
    categories: [
      { id: 'all', name: '全部' },
      { id: 'scenic', name: '景点' },
      { id: 'route', name: '路线' },
      { id: 'service', name: '服务' },
      { id: 'culture', name: '文化' },
      { id: 'activity', name: '活动' }
    ],
    questions: QUESTIONS,
    displayQuestions: [],
    filteredQuestions: QUESTIONS
  },

  lifetimes: {
    attached() {
      this.setData({
        isExpanded: this.properties.initialExpanded
      })
      this.updateQuestions()
    }
  },

  methods: {
    updateQuestions() {
      const { selectedCategory, questions } = this.data
      const filteredQuestions = selectedCategory === 'all'
        ? questions
        : questions.filter((item) => item.category === selectedCategory)
      const displayQuestions = questions.slice(0, this.properties.maxCollapsedCount)

      this.setData({
        filteredQuestions,
        displayQuestions
      })
    },

    toggleExpand() {
      const isExpanded = !this.data.isExpanded

      this.setData({
        isExpanded
      })

      this.triggerEvent('expandChange', {
        expanded: isExpanded
      })
    },

    onCategoryChange(event) {
      const { id } = event.currentTarget.dataset

      this.setData({
        selectedCategory: id || 'all'
      })

      this.updateQuestions()
    },

    onQuestionTap(event) {
      if (this.properties.disabled) {
        return
      }

      const question = event.currentTarget.dataset.question

      this.triggerEvent('questionSelect', {
        question
      })
    }
  }
})
