const QUESTIONS = [
  { id: 'q1', text: '九眼楼有哪些主要景点？', category: 'scenic', isHot: true },
  { id: 'q2', text: '九眼楼主楼在哪里？', category: 'scenic', isNew: true },
  { id: 'q3', text: '九眼楼有什么特点？', category: 'scenic' },
  { id: 'q4', text: '碑刻区有什么值得看？', category: 'scenic' },
  { id: 'q5', text: '推荐一条适合第一次来的游览路线', category: 'route', isHot: true },
  { id: 'q6', text: '从景区大门到九眼楼怎么走？', category: 'route' },
  { id: 'q7', text: '登上九眼楼大概需要多长时间？', category: 'route', isHot: true },
  { id: 'q8', text: '下山有更轻松一点的路线吗？', category: 'route' },
  { id: 'q9', text: '景区附近有停车场吗？', category: 'service' },
  { id: 'q10', text: '景区里哪里可以休息？', category: 'service', isHot: true },
  { id: 'q11', text: '城上卫生间在哪里？', category: 'service', isNew: true },
  { id: 'q12', text: '门票和开放时间怎么安排？', category: 'service' },
  { id: 'q13', text: '九眼楼为什么叫九眼楼？', category: 'culture' },
  { id: 'q14', text: '第一楼石碑有什么来历？', category: 'culture', isHot: true },
  { id: 'q15', text: '营盘城和九眼楼有什么关系？', category: 'culture' },
  { id: 'q16', text: '九眼楼哪里适合拍照打卡？', category: 'activity', isNew: true },
  { id: 'q17', text: '这里适合带孩子一起游览吗？', category: 'activity' },
  { id: 'q18', text: '景区里有讲解或AI伴游服务吗？', category: 'activity' }
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
