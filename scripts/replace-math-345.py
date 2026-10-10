import json,re,pathlib,collections,hashlib,copy
ROOT=pathlib.Path(__file__).resolve().parents[1]; IN=ROOT.parent/'incoming'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def dump(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def urls(x):
 if isinstance(x,str):return re.findall(r'https?://[^\s<>"\)]+',x)
 if isinstance(x,list):return [u for a in x for u in urls(a)]
 if isinstance(x,dict):return [u for k,v in x.items() if k in ('image_url','url','image_urls','question_images','images','diagrams','page_images') for u in urls(v)]
 return []
def canon(s):
 s=re.split(r'\n\s*روابط الصور',s)[0]
 return re.sub(r'[\s\\{}$()]','',s).replace('أ','ا').replace('إ','ا').replace('ى','ي')
NAMES={3:['تمهيد: قواعد الاشتقاق والاشتقاق الضمني','المعدلات المرتبطة','مبرهنة رول','مبرهنة القيمة المتوسطة','التقريب والتفاضلات','التزايد والتناقص والنهايات المحلية','التقعر والتحدب ونقاط الانقلاب','مسائل الثوابت والمماس والنهايات','رسم الدوال والمجال والتناظر والمحاذيات','تطبيقات القيم العظمى والصغرى','تمارين مرتبطة بالقطع المكافئ'],4:['تمهيد: مشتقات الدوال الأسية واللوغاريتمية','التكامل غير المحدد','التكامل المحدد','المساحات بين المنحنيات','تطبيقات التكامل في الحركة','الحجوم الدورانية','الدالة المقابلة وخواص التكامل','مجاميع ريمان والتجزئة','تمهيد: المعادلات المثلثية'],5:['رتبة ودرجة المعادلة التفاضلية','التحقق من حلول المعادلات التفاضلية','حل المعادلات التفاضلية وفصل المتغيرات']}
def classify(ch,q,page):
 t=q['question_text']; compact=re.sub(r'\s+','',t)
 if 'المعادلة التفاضلية' in t or 'المعادلات التفاضلية' in t or (ch==5):
  if 'رتبة' in t and 'درجة' in t:return 5,0
  if re.search(r'^(هل|برهن|بيّن|بين|اثبت|أثبت)',t) and ('حل' in t or 'حلول' in t):return 5,1
  return 5,2
 if ch==3:
  if re.search(r'جد مشتق|جد المشتقة',t):return 3,0
  if re.search(r'تقريب|التفاضلات',t):return 3,4
  if 'رول' in t:return 3,2
  if 'القيمة المتوسطة' in t:return 3,3
  if re.search(r'معدل|المعدل|بالنسبة للزمن',t):return 3,1
  if re.search(r'أكبر|اكبر|أصغر|اصغر|أقل|اقل|أقرب|اقرب',t):return 3,9
  if re.search(r'ارسم|التناظر|تناظر|المحاذيات|محاذي|نقاط التقاطع|أوسع مجال|اوسع مجال',t):return 3,8
  if re.search(r'جد بؤرة|جد البؤرة|يمس منحني القطع المكافئ',t):return 3,10
  if re.search(r'الثابت|الثوابت|جد قيمة|جد قيم|جد معادلة القطع',t) and re.search(r'نهاية|نهايات|انقلاب|مماس|يمس|محدب|مقعر|متماس',t):return 3,7
  if re.search(r'تقعر|تحدب|محدبة|مقعرة',t):return 3,6
  return 3,5
 if ch==4:
  if re.search(r'جد.*(?:dy|مشتق)|اشتق',t) and '\\int' not in t:return 4,0
  if 'قيم الزاوية' in t:return 4,8
  if re.search(r'المجموع الأسفل|المجموع الأعلى|تجزئ|تجزئة|التجزئة|تقريبية لمساحة|تقديرية|تقديري|تقديرية للتكامل',t) or 'L(' in compact or 'U(' in compact:return 4,7
  if re.search(r'جسم يتحرك|تحرك نقطة|المسافة المقطوعة|الإزاحة|بتعجيل',t):return 4,4
  if re.search(r'حجم|الحجم|دارت|دوران',t):return 4,5
  if re.search(r'مساحة|المساحة',t):return 4,3
  if re.search(r'مقابلة|مستمرة على الفترة|لتكن.*مستمرة',t):return 4,6
  if re.search(r'\\int\s*[_^]',t):return 4,2
  return 4,1
 raise ValueError((ch,t))
raw=[]; empty=[]; repaired=[]
for p in sorted(IN.rglob('*')):
 if not p.is_file():continue
 ch=int(re.search('[345]',p.parent.name)[0])
 try:x=read(p)
 except json.JSONDecodeError:
  s=p.read_text();dec=json.JSONDecoder();first,end=dec.raw_decode(s,s.index('{'));rest=s[end:];start=rest.index('{');tail=rest[start:];pos=tail.rfind(',\n      {');second=json.loads(tail[:pos]+'\n]}')
  def st(n,ex,eq,values):return {'step_number':n,'step_explanation':ex,'equation_template':eq,'inputs':[{'input_id':f'q16_s{n}_{i+1}','correct_answer':v,'options':opts}for i,(v,opts)in enumerate(values)],'hint':ex,'related_topics':['تطبيقات النهايات العظمى والصغرى']}
  second['interactive_steps'] += [st(4,'نشتق m=x+x^2 فنحصل على مشتقة الثابت المضروب في x ثم مشتقة مربع x.',"m'(x)={input_1}+{input_2}x",[('1',['1','0','2','-1']),('2',['2','1','3','-2'])]),st(5,'لإيجاد العدد الحرج نساوي المشتقة بالصفر ثم ننقل الواحد إلى الطرف الآخر.','1+2x=0\\Rightarrow 2x={input_1}',[('-1',['-1','1','0','2'])]),st(6,'نقسم الطرفين على 2 فنجد العدد المطلوب وفق الحل النهائي المرفق.','x={input_1}',[('-\\frac{1}{2}',['-\\frac{1}{2}','\\frac{1}{2}','-1','2'])]),st(7,'المشتقة الثانية موجبة، لذا تكون القيمة صغرى عند العدد الذي وجدناه.',"m''(x)={input_1}>0",[('2',['2','-2','0','1'])])]
  x=[first,second];repaired.append({'file':str(p.relative_to(IN)),'recovered_questions':2,'completed_steps':4});dest=ROOT/'content-sources/math-345'/p.name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(p.read_bytes())
 for r in x if isinstance(x,list)else [x]:
  qs=r.get('questions',[]) if 'questions'in r else [r] if 'interactive_steps'in r else []
  if not qs:empty.append(str(p.relative_to(IN)))
  for q in qs:
   assert q.get('interactive_steps'),p
   page=q.get('page_number') or r.get('page_number') or r.get('file_page_number') or int(re.search(r'(?:page_|p)(\d+)',p.name)[1]);page=int(page)
   # Retain explicitly supplied page numbers; do not guess printed-page offsets.
   cc,tt=classify(ch,q,page)
   qq=copy.deepcopy(q);qq['source_file']=str(p.relative_to(IN));qq['source_page_metadata']={k:v for k,v in r.items()if k in ('lesson_id','page_id','page_number','file_page_number','pdf_page_number','part_number','part_title','source_document')};qq['page_number']=page;qq['chapter']=cc;qq['topic_index']=tt
   ims=list(dict.fromkeys(urls(q.get('question_images'))+urls(q.get('image_urls'))+urls(q.get('images'))+urls(q.get('image_url'))+urls(q.get('question_text',''))));qq['image_urls']=ims;qq['image_url']=ims[0]if ims else None;raw.append(qq)
# Collapse duplicate copies of the same question on the same source page, choosing the richer solution.
seen={};duplicates=[]
for q in raw:
 key=(q['chapter'],q['page_number'],canon(q['question_text']))
 if key not in seen:seen[key]=q;continue
 old=seen[key];duplicates.append({'file':q['source_file'],'question':q['question_number'],'kept_source':old['source_file']})
 score=lambda a:(len(a['interactive_steps']),sum(len(s['inputs'])for s in a['interactive_steps']))
 winner,other=(q,old)if score(q)>score(old)else(old,q)
 winner['image_urls']=list(dict.fromkeys(winner['image_urls']+other['image_urls']));winner['image_url']=next(iter(winner['image_urls']),None);winner.setdefault('alternate_sources',[]).append(other['source_file']);seen[key]=winner
curr=read(ROOT/'curriculum.json');groups=collections.defaultdict(list);summary=[]
for q in seen.values():groups[(q['chapter'],q['topic_index'],q['page_number'])].append(q)
for c in curr:
 ch=int(c['id'][2:])
 if ch not in NAMES:continue
 c['topics']=[{'id':f'math-ch{ch}-t{i+1}','name':name,'files':[]}for i,name in enumerate(NAMES[ch])]
 for (cc,tt,page),qs in sorted(groups.items()):
  if cc!=ch:continue
  fn=f'math345_v2_ch{ch}_t{tt+1}_page_{page}.json';output=[]
  for j,q in enumerate(qs):
   key=f'{ch}_{tt+1}_{page}_{j+1}';q['title']=re.split(r'\n\s*روابط الصور',q['question_text'])[0];q['number']=q.get('question_number',j+1);q['model_solution']=q.get('full_model_solution','');q['steps']=[]
   for si,s in enumerate(q.pop('interactive_steps')):
    inputs=[];eq=s['equation_template']
    for ii,i in enumerate(s['inputs']):
     id=f'q_{key}_s{si+1}_i{ii+1}';value=str(i['correct_answer']);options=list(map(str,i['options']));assert value in options,(fn,si,i)
     eq=eq.replace('{input_'+str(ii+1)+'}','{'+id+'}');inputs.append({**i,'id':id,'correct_value':value,'allowed_keys':options,'label':f'القيمة {ii+1}','hint':s['hint']})
    assert not re.search(r'\{input_\d+\}',eq),(fn,eq)
    q['steps'].append({**s,'step_id':f'math345_{key}_step_{si+1}','title':f"الخطوة {s['step_number']}",'explanation':s['step_explanation'],'think':s['hint'],'html_structure':eq,'inputs':inputs})
   output.append(q)
  dump(ROOT/'data'/fn,output);c['topics'][tt]['files'].append({'file':fn,'label':f'صفحة {page} — {len(output)} '+('سؤال'if len(output)==1 else 'أسئلة')});summary.append({'chapter':ch,'topic':NAMES[ch][tt],'page':page,'questions':len(output),'images':sum(len(q['image_urls'])for q in output)})
 c['topics']=[t for t in c['topics']if t['files']]
dump(ROOT/'curriculum.json',curr);dump(ROOT/'public/curriculum.json',curr)
report={'source_files':len([p for p in IN.rglob('*')if p.is_file()]),'raw_questions':len(raw),'exported_questions':len(seen),'exported_page_topic_groups':len(groups),'duplicate_copies':len(duplicates),'empty_pages':empty,'repaired_files':repaired,'chapters':{str(ch):{'questions':sum(len(v)for (cc,_,_),v in groups.items()if cc==ch),'page_topic_groups':sum(cc==ch for cc,_,_ in groups),'topics':[{ 'name':t['name'],'pages':len(t['files'])}for c in curr if c['id']==f'ch{ch}'for t in c['topics']]}for ch in NAMES},'mapping':summary,'duplicates':duplicates}
dump(ROOT/'math-345-replacement-report.json',report);print(json.dumps({k:v for k,v in report.items()if k not in ('mapping','duplicates','empty_pages')},ensure_ascii=False,indent=2));print('EMPTY',len(empty))
