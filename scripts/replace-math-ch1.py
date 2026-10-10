import pathlib,json,re,copy,collections
ROOT=pathlib.Path(__file__).resolve().parents[1]
def dump(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def urls(x):
 if isinstance(x,str):return re.findall(r'https?://[^\s<>"\)]+',x)
 if isinstance(x,list):return [u for a in x for u in urls(a)]
 if isinstance(x,dict):return [u for k,v in x.items()if k in ('image_url','url','image_urls','question_images','images')for u in urls(v)]
 return []
curr=json.loads((ROOT/'ch1-original-curriculum.json').read_text());ch=curr[0];pages={};skipped=[];empty=[];groups=collections.defaultdict(list);mapping=[]
for p in sorted((ROOT.parent/'incoming-ch1').rglob('*.json')):
 r=json.loads(p.read_text(encoding='utf-8-sig'));qs=r.get('questions',[])
 if not qs:empty.append(p.name);continue
 if any(re.search(r'التفاضلية|dy|y\x27',q['question_text'])for q in qs):skipped.append(p.name);continue
 page=int(r.get('page_id')or r['page_number']);assert all(int(q.get('page_number',page))==page for q in qs);assert 1<=page<=46
 pages[page]=p.name
 for j,original in enumerate(qs):
  q=copy.deepcopy(original);title=q['question_text'];t=0 if page<=6 else 1 if page<=13 else 2 if page<=22 else 3
  if page==15:t=2
  if page==23 and 'حلل' in title:t=1
  key=f'1_{page}_{j+1}';steps=[]
  for si,s in enumerate(q.pop('interactive_steps')):
   eq=s['equation_template'];inputs=[]
   for ii,i in enumerate(s['inputs']):
    id=f'q_ch1v2_{key}_s{si+1}_i{ii+1}';v=str(i['correct_answer']);opts=list(map(str,i['options']));assert v in opts
    eq=eq.replace('{input_'+str(ii+1)+'}','{'+id+'}');inputs.append({**i,'id':id,'correct_value':v,'allowed_keys':opts,'label':f'القيمة {ii+1}','hint':s['hint']})
   assert not re.search(r'\{input_\d+\}',eq)
   steps.append({**s,'step_id':f'ch1v2_{key}_step_{si+1}','title':f"الخطوة {s['step_number']}",'explanation':s['step_explanation'],'think':s['hint'],'html_structure':eq,'inputs':inputs})
  ims=list(dict.fromkeys(urls(q.get('question_images'))+urls(q.get('image_urls'))+urls(q.get('images'))+urls(q.get('image_url'))))
  q.update(title=title,steps=steps,number=q.get('question_number',j+1),page_id=page,page_number=page,source_file=p.name,image_urls=ims,image_url=next(iter(ims),None),model_solution=q.get('full_model_solution',''));groups[t,page].append(q)
old=[]
for t in ch['topics']:
 keep=[]
 for item in t['files']:
  f=item if isinstance(item,str)else item['file'];page=int(re.search(r'page_(\d+)',f)[1])
  if page in pages:old.append(f)
  else:keep.append(item)
 t['files']=keep
for (t,page),qs in sorted(groups.items()):
 f=f'math_ch1_v2_page_{page}_t{t+1}.json';dump(ROOT/'data'/f,qs);ch['topics'][t]['files'].append({'file':f,'label':f'صفحة {page}'});mapping.append({'page_id':page,'source_file':pages[page],'topic':ch['topics'][t]['name'],'questions':len(qs),'file':f})
for t in ch['topics']:t['files'].sort(key=lambda f:int(re.search(r'page_(\d+)',f if isinstance(f,str)else f['file'])[1]))
for f in ['curriculum.json','public/curriculum.json','dist/curriculum.json']:dump(ROOT/f,curr)
report={'replaced_page_ids':sorted(pages),'replaced_old_files':old,'questions':sum(map(len,groups.values())),'new_files':len(groups),'excluded_other_chapter_files':skipped,'empty_files':empty,'mapping':mapping};dump(ROOT/'math-ch1-replacement-report.json',report);print(json.dumps({k:v for k,v in report.items()if k!='mapping'},ensure_ascii=False,indent=2))
