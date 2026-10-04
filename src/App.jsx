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
    try {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect(); const ratio = Math.min(window.devicePixelRatio || 1, 2)
      if (rect.width < 1 || rect.height < 1) return
      const width=Math.round(rect.width*ratio), height=Math.round(rect.height*ratio)
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,rect.width,rect.height); ctx.lineCap='round'; ctx.lineJoin='round'
      strokes.forEach(s => { if (!s?.points?.length) return; ctx.save(); ctx.globalCompositeOperation=s.erase?'destination-out':'source-over'; ctx.strokeStyle=s.color||'#111827'; ctx.lineWidth=Number(s.width)||4; ctx.beginPath(); const pts=s.points.map(p=>({x:p.x*rect.width,y:p.y*rect.height})); ctx.moveTo(pts[0].x,pts[0].y); if(pts.length===1)ctx.lineTo(pts[0].x+.01,pts[0].y+.01);else pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); ctx.stroke(); ctx.restore() })
    } catch (error) { console.warn('Drawing skipped safely:',error) }
  }
  useEffect(redraw, [strokes])
  const point = event => { const r=canvasRef.current?.getBoundingClientRect(); if(!r||r.width<1||r.height<1)return null; return {x:Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))} }
  const down = event => { try{event.preventDefault();const first=point(event);if(!first)return;setHistory(h=>[...h,strokes]);setFuture([]);const s={erase:tool==='eraser',color,width:tool==='eraser'?size*2:size,points:[first]};drawing.current=s;setStrokes(v=>[...v,s])}catch(error){drawing.current=null;console.warn('Pointer start ignored safely:',error)} }
  const move = event => { if(!drawing.current)return;try{event.preventDefault();const next=point(event);if(!next)return;const updatedStroke={...drawing.current,points:[...drawing.current.points,next]};drawing.current=updatedStroke;setStrokes(v=>[...v.slice(0,-1),updatedStroke])}catch(error){drawing.current=null;console.warn('Pointer move ignored safely:',error)} }
  const up = () => { drawing.current=null }
  return <canvas ref={canvasRef} className="draw-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}/>
}

function Whiteboard({ problem, answers, activeId, onBlank, apples, setApples, help, onExit }) {
  const currentIndex = problem.steps.findIndex(s => s.inputs.some(i => !answers[i.id]))
  const index = currentIndex < 0 ? problem.steps.length - 1 : currentIndex
  const current = problem.steps[index]
  const activeInput = current?.inputs.find(i => !answers[i.id]) || current?.inputs.find(i => i.id === activeId)
  const [tool,setTool]=useState('pen'), [color,setColor]=useState('#111827'), [size,setSize]=useState(4)
  const [strokes,setStrokes]=useState([]), [history,setHistory]=useState([]), [future,setFuture]=useState([])
  const [bubble,setBubble]=useState(null), [calculator,setCalculator]=useState(false)
  const canvasRef=useRef(null), scrollRef=useRef(null), pinnedRef=useRef(null)
  useEffect(()=>setBubble(null),[activeId,index])
  useEffect(()=>{
    const el=scrollRef.current
    const previousOverflow=document.body.style.overflow
    const previousOverscroll=document.documentElement.style.overscrollBehaviorY
    document.body.style.overflow='hidden'
    document.documentElement.style.overscrollBehaviorY='none'
    let startY=0, startScroll=0, clamping=false
    const maxScroll=()=>Math.max(0,pinnedRef.current?.offsetTop||0)
    const clamp=()=>{
      if(!el||clamping)return
      const max=maxScroll()
      if(el.scrollTop>max){clamping=true;el.scrollTop=max;requestAnimationFrame(()=>{clamping=false})}
    }
    const start=e=>{startY=e.touches?.[0]?.clientY||0;startScroll=el?.scrollTop||0}
    const move=e=>{
      if(!el||!e.touches?.length)return
      const delta=e.touches[0].clientY-startY
      const atTop=el.scrollTop<=0
      const pastLastStep=startScroll-delta>maxScroll()
      if((atTop&&delta>0)||pastLastStep)e.preventDefault()
    }
    el?.addEventListener('touchstart',start,{passive:true})
    el?.addEventListener('touchmove',move,{passive:false})
    el?.addEventListener('scroll',clamp,{passive:true})
    return()=>{el?.removeEventListener('touchstart',start);el?.removeEventListener('touchmove',move);el?.removeEventListener('scroll',clamp);document.body.style.overflow=previousOverflow;document.documentElement.style.overscrollBehaviorY=previousOverscroll}
  },[])
  const undo=()=>{if(!history.length)return;setFuture(v=>[...v,strokes]);setStrokes(history.at(-1));setHistory(v=>v.slice(0,-1))}
  const redo=()=>{if(!future.length)return;setHistory(v=>[...v,strokes]);setStrokes(future.at(-1));setFuture(v=>v.slice(0,-1))}
  const hint=()=>{if(!activeInput)return;if(apples<2)return alert('لا تملك تفاحًا كافيًا');setApples(v=>v-2);setBubble(activeInput.hint)}
  const exit=()=>{if(confirm('هل تريد الخروج؟ ستبدأ هذه المحاولة من الصفر.'))onExit()}
  return <div className="board-modal">
    <div className="board-head"><div className="board-actions"><button className="exit" onClick={exit}><X/></button><button onClick={()=>navigator.share?.({title:'السبورة'})}><Share2/></button><button className="calc" onClick={()=>setCalculator(true)}><Calculator/></button><button className="named-tool hint-tool" onClick={hint}><Lightbulb/><span>تلميح</span></button><button className="named-tool help-tool" onClick={help}><HelpCircle/><span>مساعدة</span></button></div><span className="pill apple"><Apple size={17} fill="currentColor"/>{apples}</span></div>
    <div className="board-workspace"><div className="board-scroll" ref={scrollRef}>
      <div className="board-flow"><div className="board-question"><MathText>{problem.title}</MathText></div>{problem.steps.slice(0,index).map((s,i)=><div className="board-step" key={s.step_id}><small>{s.title}</small><Equation step={s} answers={answers} solved/></div>)}</div>
      <div className="pinned-step" ref={pinnedRef}><div className="board-step current"><small>{current.title}</small><Equation step={current} answers={answers} activeId={activeId} onBlank={onBlank}/></div></div>
      {bubble && <div className="teacher-bubble"><div className="teacher">🧑‍🏫</div><div><button onClick={()=>setBubble(null)}><X size={16}/></button><MathText>{bubble}</MathText></div></div>}
      <div className="drawing-area"><DrawingCanvas {...{tool,color,size,strokes,setStrokes,history,setHistory,future,setFuture,canvasRef}}/></div>
      <button className="explain" onClick={()=>setBubble(current.explanation)}><span>شرح</span><b>🧑‍🏫</b></button>
    </div></div>
    <div className="draw-tools"><button className={tool==='pen'?'selected':''} onClick={()=>setTool('pen')}><Pen/>قلم</button><button className={tool==='eraser'?'selected':''} onClick={()=>setTool('eraser')}><Eraser/>ممحاة</button><label><Palette/>اللون<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><label className="range">السُمك<input type="range" min="2" max="18" value={size} onChange={e=>setSize(+e.target.value)}/></label><button onClick={undo}><Undo2/>تراجع</button><button onClick={redo}><Redo2/>الأمام</button><button className="danger" onClick={()=>confirm('مسح كل الرسم؟')&&setStrokes([])}><Trash2/>مسح الكل</button></div>
    {calculator && <CalculatorModal onClose={()=>setCalculator(false)}/>} 
  </div>
}

function InlineBoard({ anchorRef, onHint }) {
  const [tool,setTool]=useState('pen'), [color,setColor]=useState('#111827'), [size,setSize]=useState(4)
  const [strokes,setStrokes]=useState([]), [history,setHistory]=useState([]), [future,setFuture]=useState([])
  const [hintText,setHintText]=useState(null), [calculator,setCalculator]=useState(false)
  const canvasRef=useRef(null)
  const undo=()=>{if(!history.length)return;setFuture(v=>[...v,strokes]);setStrokes(history.at(-1));setHistory(v=>v.slice(0,-1))}
  const redo=()=>{if(!future.length)return;setHistory(v=>[...v,strokes]);setStrokes(future.at(-1));setFuture(v=>v.slice(0,-1))}
  const clear=()=>{if(!strokes.length||!confirm('مسح كل الرسم؟'))return;setHistory(v=>[...v,strokes]);setFuture([]);setStrokes([])}
  const hint=()=>{const text=onHint?.();if(text)setHintText(text)}
  return <section className="inline-board" ref={anchorRef} aria-label="السبورة">
    <div className="inline-board-title"><span><Pen size={18}/><strong>مساحة الصبورة لهذه الخطوة</strong></span><button onClick={()=>setCalculator(true)} title="الحاسبة"><Calculator size={20}/></button></div>
    <div className="inline-canvas"><DrawingCanvas {...{tool,color,size,strokes,setStrokes,history,setHistory,future,setFuture,canvasRef}}/>{hintText&&<div className="inline-hint-bubble"><button onClick={()=>setHintText(null)}><X size={15}/></button><MathText>{hintText}</MathText></div>}<button className="inline-hint" onClick={hint}><Lightbulb size={20}/>تلميح <small>-2 🍎</small></button></div>
    <div className="inline-tools">
      <button className={tool==='pen'?'selected':''} onClick={()=>setTool('pen')}><Pen/>قلم</button>
      <button className={tool==='eraser'?'selected':''} onClick={()=>setTool('eraser')}><Eraser/>ممحاة</button>
      <label><Palette/>اللون<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>
      <label className="range">السُمك<input type="range" min="2" max="18" value={size} onChange={e=>setSize(+e.target.value)}/></label>
      <button onClick={undo}><Undo2/>تراجع</button><button onClick={redo}><Redo2/>الأمام</button>
      <button className="danger" onClick={clear}><Trash2/>مسح الكل</button>
    </div>
    {calculator&&<CalculatorModal onClose={()=>setCalculator(false)}/>} 
  </section>
}

function Solver({ chapter, file, onFileChange, onBack, apples, setApples, hearts, setHearts }) {
  const [questions,setQuestions]=useState([]), [questionIndex,setQuestionIndex]=useState(0), [answers,setAnswers]=useState({}), [activeId,setActiveId]=useState(null), [choice,setChoice]=useState(null)
  const boardRef=useRef(null)
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
  useEffect(()=>{if(currentStep?.step_id)requestAnimationFrame(()=>boardRef.current?.scrollIntoView({behavior:'smooth',block:'center'}))},[currentStep?.step_id])
  if(!problem)return <div className="loading">جاري تحميل السؤال…</div>
  const inputById=id=>problem.steps.flatMap(s=>s.inputs).find(i=>i.id===id)
  const open=id=>{setActiveId(id);setChoice(inputById(id))}
  const choose=value=>{if(value===choice.correct_value){setAnswers(v=>({...v,[choice.id]:value}));setChoice(null)}else{setHearts(v=>Math.max(0,v-1))}}
  const help=()=>{const input=inputById(activeId);if(!input)return;if(apples<4)return alert('لا تملك تفاحًا كافيًا');setApples(v=>v-4);setAnswers(v=>({...v,[input.id]:input.correct_value}))}
  const boardHint=()=>{const input=inputById(activeId);if(!input)return null;if(apples<2){alert('لا تملك تفاحًا كافيًا');return null}setApples(v=>v-2);return input.hint}
  const activeIndex=problem.steps.indexOf(currentStep)
  const allInputs=problem.steps.flatMap(s=>s.inputs), solvedCount=allInputs.filter(i=>answers[i.id]).length, progress=allInputs.length?Math.round(solvedCount/allInputs.length*100):0
  const chapterFiles=chapter.topics.flatMap(t=>t.files)
  return <main className="solver"><aside><button onClick={onBack}><ArrowRight/>المواضيع</button><button onClick={()=>{const i=inputById(activeId);if(i&&apples>=2){setApples(v=>v-2);alert(i.hint)}}}><Lightbulb/>تلميح <small>-2 🍎</small></button><button onClick={help}><HelpCircle/>مساعدة <small>-4 🍎</small></button><button onClick={()=>boardRef.current?.scrollIntoView({behavior:'smooth',block:'center'})}><Pen/>الصبورة</button></aside>
    <div className="solution-shell"><div className="solver-nav"><label>الصفحة<select value={file} onChange={e=>onFileChange(e.target.value)}>{chapterFiles.map(f=><option key={f} value={f}>صفحة {f.match(/^page_(\d+)/)?.[1]}</option>)}</select></label>{questions.length>1&&<label>السؤال<select value={questionIndex} onChange={e=>{setQuestionIndex(+e.target.value);setAnswers({})}}>{questions.map((q,i)=><option key={i} value={i}>السؤال {q.number||i+1} من {questions.length}</option>)}</select></label>}<div className="progress"><span style={{width:`${progress}%`}}/><b>{progress}%</b></div></div>
    <section className="solution"><div className="problem-card"><h1><MathText>{problem.title}</MathText></h1>{problem.image_url&&<img src={problem.image_url}/>}</div>{problem.steps.slice(0,activeIndex+1).map((step,i)=>{const done=step.inputs.every(x=>answers[x.id]);return <div className={`solution-step ${done?'done':''}`} key={step.step_id}><h3>{step.title}</h3>{!done&&<p><MathText>{step.explanation}</MathText></p>}<Equation step={step} answers={answers} activeId={activeId} onBlank={open} solved={done}/>{i===activeIndex&&<InlineBoard key={step.step_id} anchorRef={boardRef} onHint={boardHint}/>}</div>})}</section>
    {progress===100&&<div className="complete"><strong>أحسنت! أتممت الحل بنجاح 🎉</strong></div>}</div>
    <Choices input={choice} onChoose={choose} onClose={()=>setChoice(null)}/>
  </main>
}

export default function App(){
  const [curriculum,setCurriculum]=useState([]),[view,setView]=useState('chapters'),[chapter,setChapter]=useState(null),[file,setFile]=useState(null),[apples,setApples]=useState(100),[hearts,setHearts]=useState(10)
  useEffect(()=>{fetch('./curriculum.json').then(r=>r.json()).then(setCurriculum)},[])
  const home=()=>{setView('chapters');setChapter(null);setFile(null)}
  return <><Header {...{apples,hearts}} onHome={home}/>{view==='chapters'&&<Chapters curriculum={curriculum} onOpen={ch=>{setChapter(ch);setView('topics')}}/>}{view==='topics'&&<Topics chapter={chapter} onBack={home} onOpen={f=>{setFile(f);setView('solver')}}/>}{view==='solver'&&<Solver {...{chapter,file,apples,setApples,hearts,setHearts}} onFileChange={setFile} onBack={()=>setView('topics')}/>}</>
}
