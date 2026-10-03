import React, { useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import {
  Apple, ArrowRight, BookOpen, Calculator, ChevronLeft, Eraser, Heart,
  HelpCircle, Home, Lightbulb, Palette, Pen, Redo2, Share2, Sparkles,
  Trash2, Undo2, X
} from 'lucide-react'

const mathHtml = value => {
  if (!value) return ''
  return String(value).replace(/\\\((.*?)\\\)|\$(.*?)\$/gs, (_, a, b) => {
    try { return katex.renderToString(a ?? b, { throwOnError: false }) } catch { return a ?? b }
  })
}

function MathText({ children, className = '' }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: mathHtml(children) }} />
}

function Equation({ step, answers, activeId, onBlank, solved = false }) {
  const parts = String(step?.html_structure || '').split(/(\{q[^{}]+\})/g)
  return <div className="equation" dir="ltr">{parts.map((part, index) => {
    const match = part.match(/^\{(q[^{}]+)\}$/)
    if (!match) {
      try { return <span key={index} dangerouslySetInnerHTML={{ __html: katex.renderToString(part, { throwOnError: false }) }} /> }
      catch { return <span key={index}>{part}</span> }
    }
    const id = match[1]
    const value = answers[id]
    if (value || solved) return <span key={id} className="answer-inline">{value || '?'}</span>
    return <button key={id} className={`answer-box ${activeId === id ? 'active' : ''}`} onClick={() => onBlank(id)}>{activeId === id ? <Pen size={18}/> : '?'}</button>
  })}</div>
}

function Header({ apples, hearts, onHome }) {
  return <header className="game-header">
    <div className="score"><span className="pill heart"><Heart size={17} fill="currentColor"/>{hearts}</span><span className="pill apple"><Apple size={17} fill="currentColor"/>{apples}</span></div>
    <button className="icon-button" onClick={onHome}><Home size={18}/><span>الرئيسية</span></button>
  </header>
}

function Chapters({ curriculum, onOpen }) {
  return <main className="page"><section className="hero"><div className="hero-icon">√x</div><h1>رياضيات السادس العلمي</h1><p>المنهاج العراقي التفاعلي — حل خطوة بخطوة</p></section>
    <div className="chapter-grid">{curriculum.map(ch => {
      const count = ch.topics.reduce((n, topic) => n + topic.files.length, 0)
      return <button className="chapter-card" key={ch.id} onClick={() => onOpen(ch)}>
        <div className="card-top"><span className="chapter-symbol"><BookOpen/></span><span className="count">{count} صفحة</span></div>
        <h2>{ch.title}</h2>{ch.topics.map(t => <p key={t.name}>‹ {t.name}</p>)}<strong>تصفح تمارين الفصل ←</strong>
      </button>
    })}</div>
  </main>
}

function Topics({ chapter, onBack, onOpen }) {
  return <main className="page"><div className="title-row"><button className="icon-button" onClick={onBack}><ArrowRight/></button><h1>{chapter.title}</h1></div>
    <div className="topic-grid">{chapter.topics.map(topic => <section className="topic-card" key={topic.name}><h2><BookOpen size={18}/>{topic.name}</h2><div className="file-grid">{topic.files.map(file => {
      const page = file.match(/^page_(\d+)/)?.[1] || '?'
      return <button key={file} onClick={() => onOpen(file)}><span>صفحة {page}</span><ChevronLeft size={16}/></button>
    })}</div></section>)}</div>
  </main>
}

function Choices({ input, onChoose, onClose }) {
  if (!input) return null
  return <div className="modal-shade"><div className="choices-card"><button className="modal-x" onClick={onClose}><X/></button><h2>اختر الإجابة الصحيحة</h2><p>{input.label}</p><div className="choice-grid">{input.allowed_keys.map(value => <button key={value} onClick={() => onChoose(value)}>{value}</button>)}</div></div></div>
}

function CalculatorModal({ onClose }) {
  const [value, setValue] = useState('0')
  const press = key => {
    if (key === 'C') return setValue('0')
    if (key === '=') { try { setValue(String(Function(`return (${value})`)())) } catch { setValue('خطأ') }; return }
    setValue(v => v === '0' || v === 'خطأ' ? key : v + key)
  }
  return <div className="calculator"><button onClick={onClose}><X size={16}/></button><div className="calc-display">{value}</div><div className="calc-grid">{['C','(',')','/','7','8','9','*','4','5','6','-','1','2','3','+','0','.','='].map(k => <button key={k} onClick={() => press(k)}>{k}</button>)}</div></div>
}

function DrawingCanvas({ tool, color, size, strokes, setStrokes, history, setHistory, future, setFuture, canvasRef }) {
  const drawing = useRef(null)
  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect(); const ratio = Math.min(devicePixelRatio || 1, 2)
    if (canvas.width !== Math.round(rect.width * ratio) || canvas.height !== Math.round(rect.height * ratio)) { canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio) }
    const ctx = canvas.getContext('2d'); ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,rect.width,rect.height); ctx.lineCap='round'; ctx.lineJoin='round'
    strokes.forEach(s => { if (!s.points.length) return; ctx.save(); ctx.globalCompositeOperation=s.erase?'destination-out':'source-over'; ctx.strokeStyle=s.color; ctx.lineWidth=s.width; ctx.beginPath(); const pts=s.points.map(p=>({x:p.x*rect.width,y:p.y*rect.height})); ctx.moveTo(pts[0].x,pts[0].y); pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); ctx.stroke(); ctx.restore() })
  }
  useEffect(redraw, [strokes])
  useEffect(() => { const fn=()=>redraw(); addEventListener('resize',fn); return()=>removeEventListener('resize',fn) }, [strokes])
  const point = event => { const r=canvasRef.current.getBoundingClientRect(); return {x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height} }
  const down = event => { event.preventDefault(); canvasRef.current.setPointerCapture(event.pointerId); setHistory(h=>[...h,strokes]); setFuture([]); const s={erase:tool==='eraser',color,width:tool==='eraser'?size*2:size,points:[point(event)]}; drawing.current=s; setStrokes(v=>[...v,s]) }
  const move = event => { if(!drawing.current)return; event.preventDefault(); drawing.current.points.push(point(event)); setStrokes(v=>[...v.slice(0,-1),{...drawing.current,points:[...drawing.current.points]}]) }
  const up = () => { drawing.current=null }
  return <canvas ref={canvasRef} className="draw-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/>
}

function Whiteboard({ problem, answers, activeId, onBlank, apples, setApples, help, onExit }) {
  const currentIndex = problem.steps.findIndex(s => s.inputs.some(i => !answers[i.id]))
  const index = currentIndex < 0 ? problem.steps.length - 1 : currentIndex
  const current = problem.steps[index]
  const activeInput = current?.inputs.find(i => i.id === activeId) || current?.inputs.find(i => !answers[i.id])
  const [tool,setTool]=useState('pen'), [color,setColor]=useState('#111827'), [size,setSize]=useState(4)
  const [strokes,setStrokes]=useState([]), [history,setHistory]=useState([]), [future,setFuture]=useState([])
  const [bubble,setBubble]=useState(null), [calculator,setCalculator]=useState(false)
  const canvasRef=useRef(null), scrollRef=useRef(null)
  useEffect(()=>{
    const el=scrollRef.current
    const previousOverflow=document.body.style.overflow
    const previousOverscroll=document.documentElement.style.overscrollBehaviorY
    document.body.style.overflow='hidden'
    document.documentElement.style.overscrollBehaviorY='none'
    let startY=0
    const start=e=>{startY=e.touches?.[0]?.clientY||0}
    const move=e=>{
      if(!el||!e.touches?.length)return
      const delta=e.touches[0].clientY-startY
      const atTop=el.scrollTop<=0
      const atBottom=Math.ceil(el.scrollTop+el.clientHeight)>=el.scrollHeight
      if((atTop&&delta>0)||(atBottom&&delta<0))e.preventDefault()
    }
    el?.addEventListener('touchstart',start,{passive:true})
    el?.addEventListener('touchmove',move,{passive:false})
    return()=>{el?.removeEventListener('touchstart',start);el?.removeEventListener('touchmove',move);document.body.style.overflow=previousOverflow;document.documentElement.style.overscrollBehaviorY=previousOverscroll}
  },[])
  const undo=()=>{if(!history.length)return;setFuture(v=>[...v,strokes]);setStrokes(history.at(-1));setHistory(v=>v.slice(0,-1))}
  const redo=()=>{if(!future.length)return;setHistory(v=>[...v,strokes]);setStrokes(future.at(-1));setFuture(v=>v.slice(0,-1))}
  const hint=()=>{if(!activeInput)return;if(apples<2)return alert('لا تملك تفاحًا كافيًا');setApples(v=>v-2);setBubble(activeInput.hint)}
  const exit=()=>{if(confirm('هل تريد الخروج؟ ستبدأ هذه المحاولة من الصفر.'))onExit()}
  return <div className="board-modal">
    <div className="board-head"><div className="board-actions"><button className="exit" onClick={exit}><X/></button><button onClick={()=>navigator.share?.({title:'السبورة'})}><Share2/></button><button className="calc" onClick={()=>setCalculator(true)}><Calculator/></button><button className="named-tool hint-tool" onClick={hint}><Lightbulb/><span>تلميح</span></button><button className="named-tool help-tool" onClick={help}><Sparkles/><span>مساعدة</span></button></div><span className="pill apple"><Apple size={17} fill="currentColor"/>{apples}</span></div>
    <div className="board-scroll" ref={scrollRef}>
      <div className="board-flow"><div className="board-question"><MathText>{problem.title}</MathText></div>{problem.steps.slice(0,index).map((s,i)=><div className="board-step" key={s.step_id}><small>{s.title}</small><Equation step={s} answers={answers} solved/></div>)}</div>
      <div className="pinned-step"><div className="board-step current"><small>{current.title}</small><Equation step={current} answers={answers} activeId={activeId} onBlank={onBlank}/></div></div>
      {bubble && <div className="teacher-bubble"><div className="teacher">🧑‍🏫</div><div><button onClick={()=>setBubble(null)}><X size={16}/></button><MathText>{bubble}</MathText></div></div>}
      <div className="drawing-area"><DrawingCanvas {...{tool,color,size,strokes,setStrokes,history,setHistory,future,setFuture,canvasRef}}/></div>
      <button className="explain" onClick={()=>setBubble(current.explanation)}><span>شرح</span><b>🧑‍🏫</b></button>
    </div>
    <div className="draw-tools"><button className={tool==='pen'?'selected':''} onClick={()=>setTool('pen')}><Pen/>قلم</button><button className={tool==='eraser'?'selected':''} onClick={()=>setTool('eraser')}><Eraser/>ممحاة</button><label><Palette/>اللون<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><label className="range">السُمك<input type="range" min="2" max="18" value={size} onChange={e=>setSize(+e.target.value)}/></label><button onClick={undo}><Undo2/>تراجع</button><button onClick={redo}><Redo2/>الأمام</button><button className="danger" onClick={()=>confirm('مسح كل الرسم؟')&&setStrokes([])}><Trash2/>مسح الكل</button></div>
    {calculator && <CalculatorModal onClose={()=>setCalculator(false)}/>} 
  </div>
}

function Solver({ chapter, file, onFileChange, onBack, apples, setApples, hearts, setHearts }) {
  const [questions,setQuestions]=useState([]), [questionIndex,setQuestionIndex]=useState(0), [answers,setAnswers]=useState({}), [activeId,setActiveId]=useState(null), [choice,setChoice]=useState(null), [board,setBoard]=useState(false)
  useEffect(()=>{fetch(`./data/${file}`).then(r=>r.json()).then(data=>{setQuestions(data);setQuestionIndex(0)})},[file])
  useEffect(()=>{
    try{setAnswers(JSON.parse(localStorage.getItem(`xxx_react_progress_${file}_${questionIndex}`)||'{}'))}catch{setAnswers({})}
  },[file,questionIndex])
  useEffect(()=>{
    if(questions.length)localStorage.setItem(`xxx_react_progress_${file}_${questionIndex}`,JSON.stringify(answers))
  },[answers,file,questionIndex,questions.length])
  const problem=questions[questionIndex]
  const currentStep=useMemo(()=>problem?.steps.find(s=>s.inputs.some(i=>!answers[i.id])) || problem?.steps.at(-1),[problem,answers])
  useEffect(()=>{setActiveId(currentStep?.inputs.find(i=>!answers[i.id])?.id||null)},[currentStep,answers])
  if(!problem)return <div className="loading">جاري تحميل السؤال…</div>
  const inputById=id=>problem.steps.flatMap(s=>s.inputs).find(i=>i.id===id)
  const open=id=>{setActiveId(id);setChoice(inputById(id))}
  const choose=value=>{if(value===choice.correct_value){setAnswers(v=>({...v,[choice.id]:value}));setChoice(null)}else{setHearts(v=>Math.max(0,v-1))}}
  const help=()=>{const input=inputById(activeId);if(!input)return;if(apples<4)return alert('لا تملك تفاحًا كافيًا');setApples(v=>v-4);setAnswers(v=>({...v,[input.id]:input.correct_value}))}
  const activeIndex=problem.steps.indexOf(currentStep)
  const allInputs=problem.steps.flatMap(s=>s.inputs), solvedCount=allInputs.filter(i=>answers[i.id]).length, progress=allInputs.length?Math.round(solvedCount/allInputs.length*100):0
  const chapterFiles=chapter.topics.flatMap(t=>t.files)
  return <main className="solver"><aside><button onClick={onBack}><ArrowRight/>المواضيع</button><button onClick={()=>{const i=inputById(activeId);if(i&&apples>=2){setApples(v=>v-2);alert(i.hint)}}}><Lightbulb/>تلميح <small>-2 🍎</small></button><button onClick={help}><Sparkles/>مساعدة <small>-4 🍎</small></button><button onClick={()=>setBoard(true)}><Pen/>الصبورة</button></aside>
    <div className="solution-shell"><div className="solver-nav"><label>الصفحة<select value={file} onChange={e=>onFileChange(e.target.value)}>{chapterFiles.map(f=><option key={f} value={f}>صفحة {f.match(/^page_(\d+)/)?.[1]}</option>)}</select></label>{questions.length>1&&<label>السؤال<select value={questionIndex} onChange={e=>{setQuestionIndex(+e.target.value);setAnswers({})}}>{questions.map((q,i)=><option key={i} value={i}>السؤال {q.number||i+1} من {questions.length}</option>)}</select></label>}<div className="progress"><span style={{width:`${progress}%`}}/><b>{progress}%</b></div></div>
    <section className="solution"><div className="problem-card"><h1><MathText>{problem.title}</MathText></h1>{problem.image_url&&<img src={problem.image_url}/>}</div>{problem.steps.slice(0,activeIndex+1).map((step,i)=>{const done=step.inputs.every(x=>answers[x.id]);return <div className={`solution-step ${done?'done':''}`} key={step.step_id}><h3>{step.title}</h3>{!done&&<p><MathText>{step.explanation}</MathText></p>}<Equation step={step} answers={answers} activeId={activeId} onBlank={open} solved={done}/></div>})}</section>
    {progress===100&&<div className="complete"><strong>أحسنت! أتممت الحل بنجاح 🎉</strong></div>}</div>
    <Choices input={choice} onChoose={choose} onClose={()=>setChoice(null)}/>{board&&<Whiteboard {...{problem,answers,activeId,onBlank:open,apples,setApples,help}} onExit={()=>{setBoard(false);setAnswers({})}}/>}
  </main>
}

export default function App(){
  const [curriculum,setCurriculum]=useState([]),[view,setView]=useState('chapters'),[chapter,setChapter]=useState(null),[file,setFile]=useState(null),[apples,setApples]=useState(100),[hearts,setHearts]=useState(10)
  useEffect(()=>{fetch('./curriculum.json').then(r=>r.json()).then(setCurriculum)},[])
  const home=()=>{setView('chapters');setChapter(null);setFile(null)}
  return <><Header {...{apples,hearts}} onHome={home}/>{view==='chapters'&&<Chapters curriculum={curriculum} onOpen={ch=>{setChapter(ch);setView('topics')}}/>}{view==='topics'&&<Topics chapter={chapter} onBack={home} onOpen={f=>{setFile(f);setView('solver')}}/>}{view==='solver'&&<Solver {...{chapter,file,apples,setApples,hearts,setHearts}} onFileChange={setFile} onBack={()=>setView('topics')}/>}</>
}
