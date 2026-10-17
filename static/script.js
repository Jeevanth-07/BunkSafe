window.BunkSafeAuth = window.BunkSafeAuth || { mode: "login", currentUser: null, submitting: false };
let currentUser = null;
const subjects = [
 {code:"BCSE302L",name:"Database Systems",kind:"Theory",attended:30,total:37,required:75,weeklyDays:[1,3]},
 {code:"BCSE302P",name:"Database Systems Lab",kind:"Lab",attended:20,total:22,required:75,weeklyDays:[2]},
 {code:"BCSE303L",name:"Operating Systems",kind:"Theory",attended:31,total:38,required:75,weeklyDays:[1,3]},
 {code:"BCSE303P",name:"Operating Systems Lab",kind:"Lab",attended:20,total:26,required:75,weeklyDays:[4]},
 {code:"BCSE306L",name:"Artificial Intelligence",kind:"Theory",attended:30,total:37,required:75,weeklyDays:[2,4]},
 {code:"BCSE307L",name:"Compiler Design",kind:"Theory",attended:31,total:38,required:75,weeklyDays:[1,3]},
 {code:"BCSE307P",name:"Compiler Design Lab",kind:"Lab",attended:18,total:22,required:75,weeklyDays:[3]},
 {code:"BCSE308L",name:"Computer Networks",kind:"Theory",attended:30,total:37,required:75,weeklyDays:[1,5]}
];
let plans=[], parsed=[], publishedExams=[], calendarEvents=[];
let safetyBuffer = 3;
const STORE_KEY="bunksafe-prototype-v2";
function persistData(){try{localStorage.setItem(STORE_KEY,JSON.stringify({subjects,plans,publishedExams,calendarEvents,safetyBuffer}));}catch(e){}}
function restoreData(){try{const d=JSON.parse(localStorage.getItem(STORE_KEY)||"null");if(d){if(Array.isArray(d.subjects)&&d.subjects.length){subjects.splice(0,subjects.length,...d.subjects)}if(Array.isArray(d.plans))plans=d.plans;if(Array.isArray(d.publishedExams))publishedExams=d.publishedExams;if(Array.isArray(d.calendarEvents))calendarEvents=d.calendarEvents;if(Number.isFinite(Number(d.safetyBuffer)))safetyBuffer=Math.max(0,Math.min(15,Number(d.safetyBuffer)));}}catch(e){}}
restoreData();
const $=id=>document.getElementById(id);
function pct(s){return s.total?100*s.attended/s.total:0}
function safeMiss(s,future){const required=Math.max(1,Math.min(100,Number(s.required)||75))/100;return Math.max(0,Math.min(future,Math.floor((Number(s.attended)||0)+future-required*((Number(s.total)||0)+future)+1e-9)))}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2800)}
function showPage(page){document.body.classList.toggle("dashboard-mode",page==="dashboard");document.querySelectorAll("main section").forEach(s=>s.classList.add("hidden"));const target=$(page+"Page");if(!target){toast("This section is not available.");return}target.classList.remove("hidden");document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));document.querySelectorAll(".mobile-nav-item[data-mobile-page]").forEach(b=>b.classList.toggle("active",b.dataset.mobilePage===page));const titles={dashboard:"Your semester at a glance",timetable:"Import your timetable",planner:"Plan your next absence",subjects:"Your subjects",exams:"Plan safely before exams",admin:"Semester calendar administration",tools:"More tools"};$("pageTitle").textContent=titles[page];if(page==="subjects")renderSubjectsTable();if(page==="planner")renderPlans();if(page==="timetable")renderScheduleMapping();if(page==="admin")renderCalendarEvents();if(page==="exams")refreshExamClassCount();if(page==="tools"){renderSubjects();makeCalendar("miniCalendar");}closeMobileMore();window.scrollTo({top:0,behavior:"smooth"})}
function toggleMobileMore(){const menu=$("mobileMoreMenu");if(menu)menu.classList.toggle("hidden");const adminItem=document.querySelector("[data-mobile-admin]");if(adminItem)adminItem.classList.toggle("hidden",!currentUser||currentUser.role!=="admin")}
function closeMobileMore(){const menu=$("mobileMoreMenu");if(menu)menu.classList.add("hidden")}
document.querySelectorAll(".nav button").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
function populateSelects(){["quickSubject","planSubject","examSubject","timelineSubject"].forEach(id=>{const el=$(id);if(!el)return;const old=el.value;el.innerHTML=subjects.map((s,i)=>`<option value="${i}">${escapeAttr(s.name)} (${escapeAttr(s.code)})</option>`).join("");if(old!==""&&Number(old)<subjects.length)el.value=old})}
let dashboardExamTarget="FAT"; // Default to the current FAT phase; users can still switch exams manually.
const dashboardPlannedMisses={};
function setDashboardExam(exam){
 const allowed=["CAT-I","CAT-II","FAT"];
 if(!allowed.includes(String(exam)))return;
 dashboardExamTarget=String(exam);
 document.querySelectorAll(".exam-switch-btn").forEach(button=>{
   const active=button.dataset.exam===dashboardExamTarget;
   button.classList.toggle("active",active);
   button.setAttribute("aria-pressed",active?"true":"false");
 });
 renderDashboardAttendance();
}
function normalizeExamLabel(value){return String(value||"").toUpperCase().replace(/[^A-Z0-9]/g,"")}
function isDashboardTargetExam(value){const label=String(value||"").toUpperCase();if(dashboardExamTarget==="CAT-I")return /CAT\s*[-–]?\s*I(?!I)\b/.test(label);if(dashboardExamTarget==="CAT-II")return /CAT\s*[-–]?\s*II\b/.test(label);return new RegExp("\\b"+dashboardExamTarget+"\\b").test(label)}
function dashboardTargetInfo(){
 const today=localISODate(new Date());
 if(dashboardExamTarget==="FAT"){
  const instructional=calendarEvents.filter(e=>{
   const type=String(e.type||"").toLowerCase();
   const title=String(e.title||"").toLowerCase();
   const isWeekdayOrder=["monday-order","tuesday-order","wednesday-order","thursday-order","friday-order"].includes(type);
   return /^\d{4}-\d{2}-\d{2}$/.test(String(e.date||"")) &&
    (type==="instructional" || isWeekdayOrder || /last instructional day|instructional day/.test(title)) &&
    !["holiday","no-class","class-cancelled"].includes(type);
  }).sort((a,b)=>a.date.localeCompare(b.date));
  const last=instructional.filter(e=>e.date>=today).slice(-1)[0];
  if(last){
   const end=new Date(last.date+"T00:00:00");
   end.setDate(end.getDate()+1);
   return {date:localISODate(end),displayDate:last.date,status:"upcoming",horizon:"last-instructional-day"};
  }
  return {date:null,status:instructional.length?"passed":"missing",horizon:"last-instructional-day"};
 }
 const matches=calendarEvents.filter(e=>e.type==="exam"&&isDashboardTargetExam(e.title));
 const published=publishedExams.filter(e=>isDashboardTargetExam(e.name||e.title)).map(e=>({date:e.date,title:e.name||e.title}));
 const candidates=[...matches.map(e=>({date:e.date,title:e.title})),...published].filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(String(e.date||""))).sort((a,b)=>a.date.localeCompare(b.date));
 const upcoming=candidates.find(e=>e.date>=today);
 if(upcoming)return {date:upcoming.date,status:"upcoming"};
 if(candidates.length)return {date:null,status:"passed"};
 return {date:null,status:"missing"};
}
function dashboardFutureSessions(subject){const info=dashboardTargetInfo();if(!info.date)return null;return countScheduledClasses(subject,info.date)}
// Dashboard bunk counts use the required attendance threshold, not the optional
// planner safety buffer. Attending future classes adds to both totals; a bunk
// adds only to the total, so the formula models the user's actual question.
function dashboardSafeAbsences(subject,future){
 // VIT lab slots (for example L15+L16) are one indivisible meeting worth
 // two attendance periods. A student either attends both periods or misses both.
 const required=Math.max(1,Math.min(100,Number(subject.required)||75))/100;
 const attended=Math.max(0,Number(subject.attended)||0);
 const total=Math.max(0,Number(subject.total)||0);
 const futurePeriods=Math.max(0,Math.floor(Number(future)||0));
 const periodsPerDecision=subjectClassUnits(subject);
 const futureMeetings=Math.floor(futurePeriods/periodsPerDecision);
 // Assume every other future meeting is attended. Find the maximum whole
 // meetings that can be missed while final attendance remains >= required.
 const availableMissedPeriods=attended+futurePeriods-required*(total+futurePeriods);
 const safeMeetings=Math.floor((availableMissedPeriods+1e-9)/periodsPerDecision);
 return Math.max(0,Math.min(futureMeetings,safeMeetings));
}
function dashboardFutureMeetings(subject,future){return Math.floor(Math.max(0,Number(future)||0)/subjectClassUnits(subject))}
function dashboardClassUnitLabel(subject,count){if(subjectClassUnits(subject)>1)return count===1?"lab session":"lab sessions";return count===1?"class":"classes"}
function adjustDashboardMiss(index,delta){const s=subjects[index];if(!s)return;const future=dashboardFutureSessions(s);if(future===null){toast(dashboardTargetInfo().status==="passed"?`${dashboardExamTarget} dates have passed. Add/select an upcoming exam date.`:`No upcoming ${dashboardExamTarget} date or mapped future classes found. Configure the exam date and timetable.`);return}const max=dashboardSafeAbsences(s,future);const next=Math.max(0,Math.min(max,Number(dashboardPlannedMisses[index]||0)+delta));dashboardPlannedMisses[index]=next;renderDashboardAttendance();}
function renderDashboardAttendance(){
 const host=$("dashboardAttendanceCards");if(!host)return;
 const avg=subjects.length?subjects.reduce((sum,s)=>sum+pct(s),0)/subjects.length:0;
 const averageRounded=Math.ceil(avg);
 const averageValue=$("dashboardAverageValue");if(averageValue)averageValue.innerHTML=`${subjects.length?averageRounded:"--"}<span>%</span>`;
 const averageProgress=$("dashboardAverageProgress");if(averageProgress)averageProgress.style.width=`${Math.max(0,Math.min(100,avg))}%`;
 const averageCount=$("dashboardAverageSubjectCount");if(averageCount)averageCount.textContent=`${subjects.length} subject${subjects.length===1?"":"s"} tracked`;
 const averageHint=$("dashboardAverageHint");if(averageHint)averageHint.textContent=!subjects.length?"Add subjects to see your average":avg>=85?"Excellent consistency — keep it up":avg>=75?"You're meeting the 75% target": "Focus on the subjects below 75%";
 const legacyAverage=$("dashboardAverage");if(legacyAverage)legacyAverage.textContent=`Average Attendance - ${averageRounded}%`;
 const targetInfo=dashboardTargetInfo();
 host.innerHTML=subjects.map((s,i)=>{
  const p=pct(s),shown=Math.ceil(p),future=dashboardFutureSessions(s),available=future!==null,safe=available?dashboardSafeAbsences(s,future):0,planned=Number(dashboardPlannedMisses[i]||0),remaining=Math.max(0,safe-planned);
  let status;
  if(!available && future===null) status=targetInfo.status==="passed"?dashboardExamTarget+" date has passed":"Set upcoming "+dashboardExamTarget+" date";
  else if(dashboardExamTarget==="FAT" && future===0) status="No mapped future classes — check weekly mapping";
  else if(!available) status=targetInfo.status==="passed"?dashboardExamTarget+" date has passed":"Set upcoming "+dashboardExamTarget+" date / timetable";
  else if(planned>safe) status="Unsafe plan";
  else if(remaining>0) status="Can bunk "+remaining+" "+dashboardClassUnitLabel(s,remaining)+" safely";
  else status=safe===0?"On margin (0 safe bunks)":"At safe limit";
  const unitCount=subjectClassUnits(s),meetings=dashboardFutureMeetings(s,future);const futureDescription=unitCount>1?`${meetings} mapped lab session(s) (${future} class periods)`:`${future} mapped class(es)`;const foot=targetInfo.date && dashboardExamTarget==="FAT" ? (futureDescription+" through last instructional day "+(targetInfo.displayDate||targetInfo.date)+(future===0?" · verify weekly mapping":"")) : available?futureDescription+" before "+dashboardExamTarget:targetInfo.status==="passed"?"Target date passed — update calendar":"Configure the last instructional day / exam date and weekly mapping";
  const color=planned>safe&&available?"#f87171":"#4ade80";
  return `<article class="attendance-course-card">
   <div class="attendance-card-meta"><span class="course-code-chip">${escapeAttr(s.code||"COURSE")}</span><span class="course-slot-chip">${escapeAttr(s.slot||s.kind||"Class")}</span><button class="attendance-remove" type="button" title="Manage this subject" aria-label="Manage ${escapeAttr(s.name)}" onclick="showPage('subjects')">×</button></div>
   <h3>${escapeAttr(s.name||"Untitled subject")}</h3>
   <div class="attendance-card-main"><div class="attendance-ring" style="--ring-value:${Math.min(100,p)}%;--ring-color:#4ade80"><span>${shown}%</span></div><div class="attendance-counts"><div><span>Total</span><strong>${Number(s.total)||0}</strong></div><div><span>Attended</span><strong class="attended-count">${Number(s.attended)||0}</strong></div></div></div>
   <div class="attendance-safe-status ${available&&remaining>0&&planned<safe?"safe":"edge"}" style="--status-color:${color}"><span class="status-message">${status}</span><div class="bunk-adjusters"><button type="button" aria-label="Reduce planned absences" ${!available?"disabled":""} onclick="adjustDashboardMiss(${i},-1)">-1</button><button type="button" aria-label="Add planned absence" ${!available||planned>=safe?"disabled":""} onclick="adjustDashboardMiss(${i},1)">+1</button></div></div>
   <div class="attendance-card-foot">Current ${Math.ceil(p)}% · Required ${Number(s.required)||75}% · ${foot}</div>
  </article>`;
 }).join("")||'<div class="notice">No subjects yet. Import your timetable to get started.</div>';
}
function renderSubjects(){const average=subjects.length?subjects.reduce((a,s)=>a+pct(s),0)/subjects.length:0;$("averageStat").textContent=average.toFixed(1)+"%";$("riskStat").textContent=subjects.filter(s=>pct(s)<s.required+5).length;$("plansStat").textContent=plans.length;$("subjectList").innerHTML=subjects.slice(0,6).map(s=>{const p=pct(s),color=p<s.required?"red":p<s.required+5?"yellow":"green";return `<div class="subject"><div class="subject-top"><div><div class="subject-name">${s.name}</div><div class="subject-code">${s.code} · ${s.kind} · ${s.attended}/${s.total} attended</div></div><div style="text-align:right"><div class="percent ${color}">${p.toFixed(0)}%</div><span class="pill ${color}">${p<s.required?"At risk":p<s.required+5?"Low buffer":"On track"}</span></div></div><div class="progress"><span style="width:${Math.min(100,p)}%;background:${p<s.required?"linear-gradient(90deg,#fb7185,#f43f5e)":p<s.required+5?"linear-gradient(90deg,#fbbf24,#f59e0b)":""}"></span></div><div class="subject-bottom"><span>${s.total-s.attended} classes missed so far</span><span>${s.required}% required</span></div></div>`}).join("");renderDashboardAttendance();populateSelects();renderSubjectsTable()}
function renderSubjectsTable(){$("subjectsTable").innerHTML=subjects.map((s,i)=>`<tr><td><strong>${s.name}</strong><br><span class="muted">${s.code} · ${s.kind}</span></td><td><input aria-label="Total classes" type="number" min="0" value="${s.total}" style="width:70px;background:#0b1220;color:#fff;border:1px solid #34415c;border-radius:7px;padding:7px" onchange="editSubject(${i},'total',this.value)"></td><td><input aria-label="Attended classes" type="number" min="0" max="${s.total}" value="${s.attended}" style="width:70px;background:#0b1220;color:#fff;border:1px solid #34415c;border-radius:7px;padding:7px" onchange="editSubject(${i},'attended',this.value)"></td><td><strong>${Math.ceil(pct(s))}%</strong></td><td>${s.required}%</td><td><button class="quiet" onclick="removeSubject(${i})">Remove</button></td></tr>`).join("")}
function editSubject(i,k,v){let n=Number(v);if(!Number.isFinite(n)||n<0){toast("Enter a valid non-negative number.");renderSubjectsTable();return}if(k==="total"&&n<1)n=1;if(k==="total"&&n<subjects[i].attended){toast("Total classes cannot be lower than attended classes.");renderSubjectsTable();return}if(k==="attended"&&n>subjects[i].total){toast("Attended classes cannot exceed total classes.");renderSubjectsTable();return}subjects[i][k]=Math.floor(n);renderSubjects();toast("Attendance updated.")}
function addSubject(){const name=prompt("Subject name:");if(!name)return;const code=prompt("Course code (optional):")||"CUSTOM";const attended=Number(prompt("Classes attended:", "0"));const total=Number(prompt("Total classes conducted:", "1"));if(!Number.isFinite(attended)||!Number.isFinite(total)||attended<0||total<1||attended>total){toast("Invalid attendance values.");return}subjects.push({name,code,kind:"Theory",attended,total,required:75});renderSubjects();toast("Subject added.")}
function removeSubject(i){if(confirm("Remove "+subjects[i].name+"?")){subjects.splice(i,1);renderSubjects();persistData();toast("Subject removed.")}}
function quickCalculate(){const s=subjects[Number($("quickSubject").value)];if(!s)return;const f=Math.max(0,Math.floor(Number($("quickFuture").value)||0)),m=Math.max(0,Math.floor(Number($("quickMiss").value)||0));if(f<1||m>f){toast("Missed classes must be between 0 and upcoming classes.");return}const p=100*(s.attended+f-m)/(s.total+f);showResult("quickResult",p,s.required,s,m,f)}
function updateSafetyBuffer(){const el=$("safetyBuffer");if(!el)return;const n=Number(el.value);safetyBuffer=Math.max(0,Math.min(15,Number.isFinite(n)?n:3));el.value=String(safetyBuffer);persistData();toast(`Safety buffer set to ${safetyBuffer} percentage point(s).`)}
function decisionMetrics(s,f){const required=Math.max(1,Math.min(100,Number(s.required)||75));const target=Math.min(100,required+safetyBuffer)/100;const base=Number(s.attended)||0,total=Number(s.total)||0;const raw=Math.floor(base+f-target*(total+f)+1e-9);const maxAbsences=Math.max(0,Math.min(f,raw));const canReachTarget=(base+f)/(total+f)>=target-1e-9;let recoverRequired=0,recoverTarget=0;if(total>0&&base/total<required/100&&required<100)recoverRequired=Math.max(0,Math.ceil((required/100*total-base)/(1-required/100)-1e-9));if(total>0&&base/total<target&&target<1)recoverTarget=Math.max(0,Math.ceil((target*total-base)/(1-target)-1e-9));return {required,target:target*100,maxAbsences,canReachTarget,recoverRequired,recoverTarget,current:total?100*base/total:0}}
function showResult(id,p,required,s,m,f){const el=$(id),d=decisionMetrics(s,f),meetsRequired=p>=required-1e-9,meetsBuffer=p>=d.target-1e-9;const margin=Math.max(0,d.maxAbsences-m);const recovery=d.current<required?`Attend approximately <b>${d.recoverRequired}</b> consecutive class(es) without absence to recover to ${required}% minimum; <b>${d.recoverTarget}</b> to reach the ${d.target.toFixed(1)}% safety target.`:`Current attendance is ${d.current.toFixed(2)}%.`;el.classList.add("show");el.innerHTML=`<div class="muted" style="font-size:10px">ATTENDANCE DECISION · ${escapeAttr(s.name)}</div><strong class="${meetsRequired?"good":"bad"}">${p.toFixed(2)}%</strong><p>${meetsRequired?`Meets the ${required}% minimum.`:`Below the ${required}% minimum: this plan is unsafe.`} ${meetsBuffer?`It also meets your ${d.target.toFixed(1)}% safety target.`:`It does not meet your ${d.target.toFixed(1)}% safety target (minimum + ${safetyBuffer} point buffer).`}</p><p><b>Estimated maximum absences:</b> ${d.maxAbsences} of the next ${f} classes. <b>Remaining buffer:</b> ${margin} class(es) after this plan.</p><p>${d.canReachTarget?"The safety target is mathematically reachable within these future classes.":"Even attending every future class may not reach the safety target by this horizon."} ${recovery}</p><p class="muted">Assumes ${f} future sessions and ${m} absences; verify the class count against the official timetable.</p>`;el.dataset.p=String(p);el.dataset.maxAbsences=String(d.maxAbsences)}
function previewPlan(){const s=subjects[Number($("planSubject").value)];if(!s)return;const f=Math.floor(Number($("planFuture").value)),m=Math.floor(Number($("planMiss").value));if(!Number.isFinite(f)||!Number.isFinite(m)||f<1||m<1||m>f){toast("Check the future and missed class counts.");return}const p=100*(s.attended+f-m)/(s.total+f);showResult("planResult",p,s.required,s,m,f);$("planResult").dataset.p=p}
function savePlan(){previewPlan();const el=$("planResult");if(!el.classList.contains("show"))return;const s=subjects[Number($("planSubject").value)];const date=$("planDate").value;if(!date){toast("Choose a date first.");return}const p=Number(el.dataset.p);plans.push({date,subject:s.name,code:s.code,miss:Number($("planMiss").value),future:Number($("planFuture").value),projected:p});renderPlans();renderSubjects();toast("Plan saved on this device.")}
function renderPlans(){$("savedPlans").innerHTML=plans.length?plans.slice().reverse().map((p,idx)=>`<div class="subject"><div class="subject-top"><div><div class="subject-name">${p.subject}</div><div class="subject-code">${p.date} · ${p.miss} planned absence(s)</div></div><span class="pill ${p.projected>=75?"green":"red"}">${p.projected.toFixed(1)}%</span></div><div style="text-align:right;margin-top:8px"><button class="quiet" onclick="deletePlan(${plans.length-1-idx})">Delete</button></div></div>`).join(""):'<div class="muted" style="font-size:12px">No saved plans yet.</div>'}
function deletePlan(i){plans.splice(i,1);renderPlans();renderSubjects();persistData()}
function makeCalendar(target){const el=$(target);if(!el)return;const year=2026,month=9,first=new Date(year,month,1).getDay(),days=new Date(year,month+1,0).getDate();let html=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>`<div class="dayname">${d}</div>`).join("");for(let i=0;i<first;i++)html+='<div class="day empty"></div>';for(let d=1;d<=days;d++){const date=new Date(year,month,d),dow=date.getDay(),special=[1,2,3,4,5,6,7,8,9,12,13,14,15,16,19,20,21,22,23,24,26,27,28,29,30,31].includes(d),holiday=[2,19].includes(d),cls=(special?"has-class ":"")+(holiday?"holiday ":"");html+=`<button class="day ${cls} ${d===17?"today":""}" onclick="selectDate(${d})" title="${holiday?"Holiday":special?"Possible instructional day":"No demo class marker"}">${d}</button>`}el.innerHTML=html}
function selectDate(d){$("planDate").value=`2026-10-${String(d).padStart(2,"0")}`;showPage("planner");toast("Planner date set to October "+d+".")}
function loadExample(){$("timetableText").value=`1 General (Semester) BCSE302L - Database Systems (Theory Only) D2+TD2 SJT402 SWATHI J.N. SCOPE Registered and Approved
2 General (Semester) BCSE302P - Database Systems Lab (Lab Only) L5+L6 PRP231 SWATHI J.N. SCOPE Registered and Approved
3 General (Semester) BCSE303L - Operating Systems (Theory Only) B2+TB2 SJT402 KEERTHIKA P. SCOPE Registered and Approved
4 General (Semester) BCSE306L - Artificial Intelligence (Theory Only) C2+TC2 SJT404 ANURADHA D. SCOPE Registered and Approved
5 General (Semester) BCSE307L - Compiler Design (Theory Only) G2+TG2 SJT513 SHALINI L. SCOPE Registered and Approved
6 General (Semester) BCSE308L - Computer Networks (Theory Only) F2+TF2 SJT409 KOPPERUNDEVI N. SCOPE Registered and Approved`;toast("Sample text loaded. Parse it to see the preview.")}
function parseTimetable(){
 const raw=$("timetableText").value.trim();
 if(!raw){toast("Paste timetable text first.");return}
 parsed=[];
 const seen=new Set();
 // VTOP exports may be pasted as a multi-line table or as one numbered record per line.
 // A course code must have a course suffix (L/P/N), which excludes room codes such as SJT402 and PRP231.
 const codeRe=/\b([A-Z]{2,6}\d{3,4}[LPN])\b/gi;
 const matches=[...raw.matchAll(codeRe)];
 for(let i=0;i<matches.length;i++){
   const m=matches[i], code=m[1].toUpperCase();
   if(seen.has(code))continue;
   const nextIndex=i+1<matches.length?matches[i+1].index:raw.length;
   const block=raw.slice(m.index,nextIndex);
   const before=raw.slice(Math.max(0,m.index-100),m.index);
   // Ignore accidental code-like tokens unless followed by a course title separator/title.
   const afterCode=block.slice(m[0].length).replace(/^\s*/,'');
   let name="";
   const inlineTitle=afterCode.match(/^\s*[-–:]\s*([^\r\n]+?)(?=\s+(?:D\d|C\d|B\d|F\d|G\d|A\d|L\d|NIL)\b|$)/i);
   if(inlineTitle)name=inlineTitle[1].trim();
   const lines=block.slice(m[0].length).split(/\r?\n/).map(x=>x.replace(/[\t\u00a0]+/g," ").trim()).filter(Boolean);
   if(!name){
     for(const line of lines.slice(0,10)){
       const cleaned=line.replace(/^\d+\s+/,"").replace(/^[-:–]+\s*/,"").trim();
       const title=cleaned.match(/^(.+?)\s*\(\s*(?:Theory Only|Lab Only|Project Only|Online Course|Soft Skill)\s*\)/i);
       if(title){name=title[1].replace(/^[-–:]\s*/,"").trim();break}
       if(cleaned && !/^(?:General\s*\(Semester\)|General|Semester|\d+\s+\d+\s+\d+|Discipline Core|Open Elective|Non-graded Core Requirement|Regular|VL\d{6,}|[A-Z]{2,6}\d{3,4}[LPN]?|[A-Z]{2,6}\d{3,4}[LPN]?\s*[-–:]?|Registered and Approved|SCOPE|SSL|NIL|Biometric|Manual)$/i.test(cleaned) && !/^[A-Z][A-Z .'-]{2,}$/.test(cleaned)){
         const candidate=cleaned.replace(/\s*\(\s*(?:Theory Only|Lab Only|Project Only|Online Course|Soft Skill)\s*\)\s*/ig,"").trim();
         if(candidate && !/^\d+$/.test(candidate)){name=candidate;break}
       }
     }
   }
   // Course records without a visible title separator are not course records; skip room/faculty tokens.
   if(!name || name.length<3)continue;
   name=name.replace(/\s*\(\s*(?:Theory Only|Lab Only|Project Only|Online Course|Soft Skill)\s*\)\s*/ig,"").replace(/\s+/g," ").trim();
   const kindMatch=block.match(/\(\s*(Theory Only|Lab Only|Project Only|Online Course|Soft Skill)\s*\)/i);
   let kind="Review";
   if(kindMatch){const label=kindMatch[1].toLowerCase();kind=label==="lab only"?"Lab":label==="theory only"?"Theory":"Review"}
   else if(/P$/i.test(code))kind="Lab";
   else if(/L$/i.test(code))kind="Theory";
   const slotMatch=block.match(/\b(?:[A-H]\d{1,2}|L\d{1,2}|T[A-H]\d{1,2}|NIL)(?:\s*\+\s*(?:[A-H]\d{1,2}|L\d{1,2}|T[A-H]\d{1,2}))*\b/i);
   const slot=slotMatch?slotMatch[0].replace(/\s+/g,"").toUpperCase():"";
   const rowWarnings=[];
   if(!slot)rowWarnings.push("Slot code not detected; enter it manually");
   if(kind==="Review")rowWarnings.push("Class type needs review");
   seen.add(code);
   parsed.push({code,name,slot,kind,line:block,warnings:rowWarnings});
 }
 const msg=$("parseMessage");msg.classList.remove("hidden");
 if(!parsed.length){msg.textContent="No course records detected. Ensure each course has a code followed by its course name (for example, BCSE302P - Database Systems Lab).";$("parsedCount").textContent="No courses detected";$("saveParsed").disabled=true;return}
 const warningCount=parsed.filter(p=>p.warnings.length).length;
 msg.textContent=`Detected ${parsed.length} unique course(s), including theory, lab and online records where present. ${warningCount} course(s) need review. Check every slot before saving.`;
 $("parsedCount").textContent=`${parsed.length} course(s) · ${warningCount} need review`;
 $("saveParsed").disabled=false;
 $("parsedTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Course code</th><th>Course name</th><th>Class type</th><th>Slot code</th><th>Validation</th></tr></thead><tbody>${parsed.map((p,i)=>`<tr><td><input value="${escapeAttr(p.code)}" onchange="parsed[${i}].code=this.value.trim().toUpperCase();validateParsedRows()" style="width:110px;background:#0b1220;color:white;border:1px solid #34415c;border-radius:6px;padding:6px"></td><td><input value="${escapeAttr(p.name)}" onchange="parsed[${i}].name=this.value.trim();validateParsedRows()" style="min-width:180px;width:100%;background:#0b1220;color:white;border:1px solid #34415c;border-radius:6px;padding:6px"></td><td><select onchange="parsed[${i}].kind=this.value;validateParsedRows()" style="background:#0b1220;color:white;border:1px solid #34415c;border-radius:6px;padding:6px"><option ${p.kind==="Theory"?"selected":""}>Theory</option><option ${p.kind==="Lab"?"selected":""}>Lab</option><option ${p.kind==="Review"?"selected":""}>Review</option></select></td><td><input value="${escapeAttr(p.slot)}" onchange="parsed[${i}].slot=this.value.trim().toUpperCase();validateParsedRows()" style="width:110px;background:#0b1220;color:white;border:1px solid #34415c;border-radius:6px;padding:6px"></td><td id="parsedValidation${i}"></td></tr>`).join("")}</tbody></table></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="quiet" onclick="downloadParsedCoursesCsv()">Export reviewed courses as CSV</button><button class="quiet" onclick="downloadSlotMappingTemplate()">Download slot-mapping template</button></div>`;
 validateParsedRows();
}
function validateParsedRows(){
 const codes=parsed.map(p=>String(p.code||"").trim().toUpperCase());
 parsed.forEach((p,i)=>{
   const warnings=[];
   if(!/^[A-Z]{2,6}\d{3,4}[A-Z]?$/.test(String(p.code||"").trim().toUpperCase()))warnings.push("Invalid course code");
   if(codes.filter(c=>c===String(p.code||"").trim().toUpperCase()).length>1)warnings.push("Duplicate course code");
   if(!String(p.name||"").trim())warnings.push("Missing name");
   if(!String(p.slot||"").trim()||(!/^(?:NIL|ONLINE)$/i.test(p.slot)&&!/[A-Z]\d/i.test(p.slot)))warnings.push("Missing/unclear slot");
   if(p.kind==="Review")warnings.push("Choose class type");
   const el=$("parsedValidation"+i);
   if(el)el.innerHTML=warnings.length?`<span class="pill yellow">${escapeAttr(warnings.join(" · "))}</span>`:'<span class="pill green">Fields present</span>';
   p.warnings=warnings;
 });
 const count=parsed.filter(p=>p.warnings.length).length;
 $("parsedCount").textContent=`${parsed.length} course(s) · ${count} need review`;
 $("saveParsed").disabled=!parsed.length||parsed.some(p=>!p.code.trim()||!p.name.trim()||!p.slot.trim()||p.kind==="Review")||new Set(codes).size!==codes.length;
}
function downloadParsedCoursesCsv(){
 if(!parsed.length){toast("Parse a timetable first.");return}
 const rows=[["courseCode","courseName","classType","slotCode"],...parsed.map(p=>[p.code,p.name,p.kind,p.slot])];
 const csv=rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
 downloadTextFile("bunksafe-reviewed-courses.csv",csv,"text/csv;charset=utf-8");
}
function downloadSlotMappingTemplate(){
 const rows=[["courseCode","courseName","slotCode","weekday","verifiedBy"],...parsed.map(p=>[p.code,p.name,p.slot,"",""] )];
 const csv=rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
 downloadTextFile("bunksafe-slot-mapping-template.csv",csv,"text/csv;charset=utf-8");
}
function downloadTextFile(filename,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
function escapeAttr(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function saveParsedCourses(){validateParsedRows();if(!parsed.length||parsed.some(p=>p.warnings.length)){toast("Review and correct all course fields before saving.");return}let added=0,updated=0;parsed.forEach(p=>{const existing=subjects.find(s=>String(s.code||"").toUpperCase()===p.code.toUpperCase());if(existing){existing.name=p.name;existing.kind=p.kind;existing.slot=p.slot;updated++}else{subjects.push({code:p.code,name:p.name,kind:p.kind,slot:p.slot,attended:0,total:0,required:75,weeklyDays:[]});added++}});renderSubjects();persistData();toast(`${added} new course(s) added; ${updated} existing course(s) updated. Now enter attendance and verify weekly mappings.`);showPage("subjects")}
function clearTimetable(){$("timetableText").value="";$("parseMessage").classList.add("hidden");parsed=[];$("parsedCount").textContent="No imported courses yet";$("parsedTable").innerHTML='<div class="muted" style="font-size:12px;padding:10px 0">Your parsed timetable preview will appear here.</div>';$("saveParsed").disabled=true}

$("calendarFile").addEventListener("change",function(){const f=this.files&&this.files[0];$("calendarFileInfo").textContent=f?`Selected: ${f.name} · ${(f.size/1024).toFixed(1)} KB. Dates must be entered and verified below in this prototype.`:"No file selected.";});
function publishExam(){
 const name=$("newExamName").value.trim(),date=$("newExamDate").value,type=$("newExamType").value,notes=$("newExamNotes").value.trim();
 if(!name||!date){toast("Enter an exam name and date.");return}
 publishedExams.push({name,date,type,notes,semester:$("semesterName").value.trim()||"Current semester"});
 publishedExams.sort((a,b)=>a.date.localeCompare(b.date));
 renderExams();persistData();
 $("newExamName").value="";$("newExamDate").value="";$("newExamNotes").value="";
 toast("Exam date published in this prototype.");
}
function renderExams(){
 const list=$("examList"),select=$("examSelect"),banner=$("nextExamBanner");
 if(!publishedExams.length){list.innerHTML='<div class="muted" style="font-size:12px">No exam dates published yet.</div>';select.innerHTML='<option value="">No published exams</option>';banner.textContent="No exam calendar has been published yet. The administrator can add the semester calendar in Admin.";return}
 list.innerHTML=publishedExams.map((e,i)=>`<div class="subject"><div class="subject-top"><div><div class="subject-name">${escapeAttr(e.name)}</div><div class="subject-code">${e.date} · ${escapeAttr(e.type)} · ${escapeAttr(e.semester)}</div>${e.notes?`<div class="subject-code">${escapeAttr(e.notes)}</div>`:""}</div><button class="quiet" onclick="deleteExam(${i})">Delete</button></div></div>`).join("");
 select.innerHTML=publishedExams.map((e,i)=>`<option value="${i}">${escapeAttr(e.name)} — ${e.date}</option>`).join("");
 banner.textContent=`${publishedExams.length} exam date(s) published for ${publishedExams[0].semester}. Next listed exam: ${publishedExams[0].name} on ${publishedExams[0].date}.`;
 updateExamDate();
}
function deleteExam(i){publishedExams.splice(i,1);renderExams();persistData();toast("Exam removed from this prototype.");}
function refreshExamClassCount(){
 const dateEl=$("examDate"), subjectEl=$("examSubject"), futureEl=$("examFuture");
 if(!dateEl||!subjectEl||!futureEl)return 0;
 const subject=subjects[Number(subjectEl.value)];
 const count=countScheduledClasses(subject,dateEl.value);
 futureEl.value=String(count);
 return count;
}
function updateExamDate(){const e=publishedExams[Number($("examSelect").value)];if(e)$("examDate").value=e.date;refreshExamClassCount();}
$("examDate").addEventListener("change",refreshExamClassCount);
$("examSubject").addEventListener("change",refreshExamClassCount);
function isExcludedDate(dateStr){return calendarEvents.some(e=>e.date===dateStr&&["holiday","no-class"].includes(e.type));}
const DEFAULT_VIT_SLOT_DAYS = {'A1': [1, 3], 'A2': [1, 3], 'B1': [2, 4], 'B2': [2, 4], 'C1': [3, 5], 'C2': [3, 5], 'D1': [1, 4], 'D2': [1, 4], 'E1': [2, 5], 'E2': [2, 5], 'F1': [1, 3], 'F2': [1, 3], 'G1': [2, 4], 'G2': [2, 4], 'L1': [1], 'L10': [2], 'L11': [2], 'L12': [2], 'L13': [3], 'L14': [3], 'L15': [3], 'L16': [3], 'L17': [3], 'L18': [3], 'L19': [4], 'L2': [1], 'L20': [4], 'L21': [4], 'L22': [4], 'L23': [4], 'L24': [4], 'L25': [5], 'L26': [5], 'L27': [5], 'L28': [5], 'L29': [5], 'L3': [1], 'L30': [5], 'L31': [1], 'L32': [1], 'L33': [1], 'L34': [1], 'L35': [1], 'L36': [1], 'L37': [2], 'L38': [2], 'L39': [2], 'L4': [1], 'L40': [2], 'L41': [2], 'L42': [2], 'L43': [3], 'L44': [3], 'L45': [3], 'L46': [3], 'L47': [3], 'L48': [3], 'L49': [4], 'L5': [1], 'L50': [4], 'L51': [4], 'L52': [4], 'L53': [4], 'L54': [4], 'L55': [5], 'L56': [5], 'L57': [5], 'L58': [5], 'L59': [5], 'L6': [1], 'L60': [5], 'L7': [2], 'L8': [2], 'L9': [2], 'TA1': [5], 'TA2': [5], 'TAA1': [2], 'TAA2': [2], 'TB1': [1], 'TB2': [1], 'TBB2': [3], 'TC1': [2], 'TC2': [2], 'TCC1': [4], 'TCC2': [4], 'TD1': [5], 'TD2': [3], 'TDD2': [5], 'TE1': [4], 'TE2': [4], 'TF1': [5], 'TF2': [5], 'TG1': [1], 'TG2': [1], 'V1': [3], 'V2': [3], 'V3': [1], 'V4': [2], 'V5': [3], 'V6': [4], 'V7': [5]};
function inferredSlotWeekdays(subject){
 const configured=Array.isArray(subject?.weeklyDays)?subject.weeklyDays:[];
 if(configured.length)return configured;
 const codes=String(subject?.slot||"").toUpperCase().split(/[+,;|/\s]+/).filter(Boolean);
 const days=new Set();
 codes.forEach(code=>(DEFAULT_VIT_SLOT_DAYS[code]||[]).forEach(day=>days.add(day)));
 return [...days].sort((a,b)=>a-b);
}
function subjectClassUnits(subject){
 const kind=String(subject?.kind||"").trim().toLowerCase();
 const code=String(subject?.code||"").trim().toUpperCase();
 const name=String(subject?.name||"").trim().toLowerCase();
 // VIT lab slots such as L5+L6 represent two class periods in one lab meeting.
 return kind==="lab"||code.endsWith("P")||name.includes("lab")?2:1;
}
function countScheduledClasses(subject,examDate){
 if(!subject||!examDate)return 0;
 const units=subjectClassUnits(subject);
 const end=new Date(examDate+"T00:00:00");let count=0;
 const start=new Date();start.setHours(0,0,0,0);
 if(end<=start)return 0;
 const days=inferredSlotWeekdays(subject);
 const substituteDay={"monday-order":1,"tuesday-order":2,"wednesday-order":3,"thursday-order":4,"friday-order":5};
 const subjectCode=String(subject.code||"").trim().toUpperCase();
 for(let d=new Date(start);d<end;d.setDate(d.getDate()+1)){
   const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
   const events=calendarEvents.filter(e=>e.date===iso);
   if(events.some(e=>["holiday","no-class"].includes(e.type)))continue;
   const explicit=events.filter(e=>["class-session","class-cancelled"].includes(e.type)&&String(e.courseCode||"").trim().toUpperCase()===subjectCode);
   if(explicit.length){
     const last=explicit[explicit.length-1];
     if(last.type==="class-session")count+=units;
     continue;
   }
   const slotDay=events.slice().reverse().find(e=>e.type==="slot-day");
   if(slotDay){
     const subjectSlots=String(subject.slot||"").toUpperCase().split(/[+,\s;|/]+/).map(x=>x.trim()).filter(Boolean);
     const activeSlots=String(slotDay.title||"").toUpperCase().split(/[+,\s;|/]+/).map(x=>x.trim()).filter(Boolean);
     if(subjectSlots.some(slot=>activeSlots.includes(slot)))count+=units;
     continue;
   }
   const override=events.slice().reverse().find(e=>Object.prototype.hasOwnProperty.call(substituteDay,e.type));
   const effectiveDay=override?substituteDay[override.type]:d.getDay();
   if(days.includes(effectiveDay))count+=units;
 }
 return count;
}
function explainSubjectDate(subject, iso){
 const events=calendarEvents.filter(e=>e.date===iso), subjectCode=String(subject?.code||"").trim().toUpperCase();
 const substituteDay={"monday-order":1,"tuesday-order":2,"wednesday-order":3,"thursday-order":4,"friday-order":5};
 const day=new Date(iso+"T00:00:00");
 if(!subject)return {counted:false,reason:"No subject selected",source:"Validation"};
 const holiday=events.find(e=>["holiday","no-class"].includes(e.type));
 if(holiday)return {counted:false,reason:`Excluded: ${holiday.type}${holiday.title?" — "+holiday.title:""}`,source:"Calendar exclusion"};
 const explicit=events.filter(e=>["class-session","class-cancelled"].includes(e.type)&&String(e.courseCode||"").trim().toUpperCase()===subjectCode);
 if(explicit.length){const last=explicit[explicit.length-1];return last.type==="class-session"?{counted:true,reason:`Included: explicit extra/confirmed class${last.title?" — "+last.title:""}`,source:"Subject-specific override"}:{counted:false,reason:`Excluded: subject class cancelled${last.title?" — "+last.title:""}`,source:"Subject-specific override"};}
 const slotDay=events.slice().reverse().find(e=>e.type==="slot-day");
 if(slotDay){const subjectSlots=String(subject.slot||"").toUpperCase().split(/[+,\s;|/]+/).map(x=>x.trim()).filter(Boolean);const activeSlots=String(slotDay.title||"").toUpperCase().split(/[+,\s;|/]+/).map(x=>x.trim()).filter(Boolean);const matches=subjectSlots.length>0&&subjectSlots.some(slot=>activeSlots.includes(slot));return {counted:matches,reason:matches?`Included: slot match (${subjectSlots.filter(slot=>activeSlots.includes(slot)).join(", ")})`:`Excluded: active-slot date does not match this subject's configured slot${subjectSlots.length?" ("+subjectSlots.join(", ")+")":"; subject slot is missing"}`,source:"Active slot codes"};}
 const override=events.slice().reverse().find(e=>Object.prototype.hasOwnProperty.call(substituteDay,e.type));const effectiveDay=override?substituteDay[override.type]:day.getDay();const dayNames=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];const configured=inferredSlotWeekdays(subject);const match=configured.includes(effectiveDay);
 if(override)return {counted:match,reason:match?`Included: ${override.type.replace("-order"," ")} timetable matches configured ${dayNames[effectiveDay]}`:`Excluded: ${override.type.replace("-order"," ")} timetable; subject is not mapped to ${dayNames[effectiveDay]}`,source:"Weekday substitution"};
 return {counted:match,reason:match?`Included: ${dayNames[effectiveDay]} is in this subject's weekly mapping`:`Excluded: ${dayNames[effectiveDay]} is not in this subject's weekly mapping`,source:"Weekly mapping"};
}
let datedTimelineRows=[];
async function buildDatedTimeline(){
 const subject=subjects[Number($("timelineSubject").value)],examDate=$("timelineExamDate").value||$("examDate").value;
 if(!subject||!examDate){toast("Choose a subject and exam date first.");return;}
 const start=new Date();start.setHours(0,0,0,0);const startDate=`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}-${String(start.getDate()).padStart(2,"0")}`;
 const end=new Date(examDate+"T00:00:00");if(end<=start){toast("Choose an exam date after today to build the timeline.");return;}
 if(Math.round((end-start)/86400000)>550){toast("Choose an exam date within the next 550 days.");return;}
 const summary=$("datedTimelineSummary"),table=$("datedTimelineTable");summary.textContent="Building timeline with the server-side schedule engine…";table.innerHTML="";
 try{
   const response=await fetch("/api/schedule/preview",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({subject,events:calendarEvents,startDate,examDate})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||`Server returned ${response.status}`);
   datedTimelineRows=result.rows.map(r=>({date:r.date,day:r.day.slice(0,3),counted:Boolean(r.counted),reason:r.reason,source:r.source}));
   renderDatedTimeline();summary.innerHTML+=`<br><span class="muted">Calculated by the server-side schedule engine · ${result.sessionsCounted} session(s) counted before ${escapeAttr(examDate)}.</span>`;
 }catch(error){
   datedTimelineRows=[];table.innerHTML="";summary.textContent="Could not build the server-side timeline: "+error.message+". Sign in again and retry. The browser-side result was not substituted, to avoid showing a potentially different calculation.";toast("Server schedule preview failed.");
 }
}
function renderDatedTimeline(){const summary=$("datedTimelineSummary"),table=$("datedTimelineTable");if(!summary||!table)return;const included=datedTimelineRows.filter(r=>r.counted).length;const showAll=$("timelineShowAll")?.checked!==false;const rows=showAll?datedTimelineRows:datedTimelineRows.filter(r=>r.counted);summary.innerHTML=`Timeline covers <b>${datedTimelineRows.length}</b> date(s), with <b>${included}</b> counted session(s) and <b>${datedTimelineRows.length-included}</b> excluded date(s). ${showAll?"All dates are shown.":"Only counted class sessions are shown."}`;if(!rows.length){table.innerHTML='<div class="muted" style="padding:12px;font-size:12px">No rows to display. Check the date range and timetable mapping.</div>';return;}table.innerHTML=`<table><thead><tr><th>Date</th><th>Day</th><th>Decision</th><th>Reason</th><th>Rule used</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.date}</td><td>${escapeAttr(r.day)}</td><td><span class="pill ${r.counted?'green':'yellow'}">${r.counted?'Counted':'Excluded'}</span></td><td>${escapeAttr(r.reason)}</td><td>${escapeAttr(r.source)}</td></tr>`).join('')}</tbody></table>`;}
function exportDatedTimelineCsv(){if(!datedTimelineRows.length){buildDatedTimeline();if(!datedTimelineRows.length)return;}const rows=[["date","day","counted_as_class","reason","rule_used"],...datedTimelineRows.map(r=>[r.date,r.day,r.counted?"yes":"no",r.reason,r.source])];const csv=rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='BunkSafe_dated_class_timeline.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Dated class timeline exported.');}
$("timelineShowAll")?.addEventListener("change",renderDatedTimeline);
$("examDate").addEventListener("change",()=>{refreshExamClassCount();if($("timelineExamDate"))$("timelineExamDate").value=$("examDate").value;});
$("examSubject").addEventListener("change",refreshExamClassCount);
function calculateExamPlan(){
 const s=subjects[Number($("examSubject").value)];if(!s)return;
 const f=refreshExamClassCount(),m=Number($("examMiss").value);
 if(!Number.isInteger(m)||m<0||m>f){toast(`Choose between 0 and ${f} absences. Check the subject's weekly mapping and exam date.`);return}
 const p=100*(s.attended+f-m)/(s.total+f);
 const min=s.required/100;
 const max=Math.max(0,Math.floor((s.attended+f)-min*(s.total+f)+1e-9));
 const el=$("examResult");el.classList.add("show");
 el.innerHTML=`<div class="muted" style="font-size:10px">PROJECTED AT EXAM DATE · ${escapeAttr(s.name)}</div><strong class="${p>=s.required?"good":"bad"}">${p.toFixed(2)}%</strong><p>BunkSafe counted <b>${f}</b> scheduled class session(s) before ${$("examDate").value}, based on verified active slot codes when configured for a date, otherwise your weekly mapping, holiday exclusions, weekday substitutions, and subject-specific session overrides entered by the admin.</p><p>Estimated maximum absences before the exam: <b>${max}</b>. Your selected plan misses ${m} class(es), leaving ${max-m} estimated absence(s) of margin.</p><p>${p>=s.required?"This estimate meets the selected threshold.":"This estimate falls below the selected threshold."} This is still an estimate: verify VIT day-order/slot mappings and the official attendance record.</p>`;
}


function addCalendarEvent(){
 const date=$("eventDate").value,type=$("eventType").value,title=$("eventTitle").value.trim();
 const courseCode=$("eventCourseCode").value.trim().toUpperCase();
 if(!date||!title){toast("Enter the event date and title.");return}
 if(["class-session","class-cancelled"].includes(type)&&!courseCode){toast("Enter the course code for a subject-specific session override.");return}
 if(type==="slot-day"){
   const codes=title.toUpperCase().split(/[+,\s;|/]+/).map(x=>x.trim()).filter(Boolean);
   if(!codes.length||codes.some(x=>!/[A-Z]{1,3}\d{1,2}/.test(x))){toast("Enter active slot codes like D2, TD2, A1 separated by commas.");return}
 }
 calendarEvents.push({date,type,title,courseCode:["class-session","class-cancelled"].includes(type)?courseCode:""});calendarEvents.sort((a,b)=>a.date.localeCompare(b.date));
 $("eventDate").value="";$("eventTitle").value="";$("eventCourseCode").value="";
 renderCalendarEvents();persistData();refreshExamClassCount();toast("Academic calendar event added.");
}
let showRoutineInstructionalDays = false;
let selectedCalendarCategory = "CAT-I";
function calendarCategory(e){
 const title=String(e.title||"").toUpperCase().replace(/\s+/g," ").trim();
 if(/CAT\s*[-–]?\s*I\b/.test(title) && !/CAT\s*[-–]?\s*II\b/.test(title))return "CAT-I";
 if(/CAT\s*[-–]?\s*II\b/.test(title))return "CAT-II";
 if(e.type==="holiday" || e.type==="no-class" || /HOLIDAY|DEEPAVALI|JAYANTHI|CHATHURTHI|POOJA|INDEPENDENCE DAY|GRAVITAS|MEELAD/.test(title))return "Holidays";
 if(e.type==="instructional" || /INSTRUCTIONAL DAY/.test(title))return "Instructional day";
 return "Other events";
}
function setCalendarCategory(category){selectedCalendarCategory=category;renderCalendarEvents();}
function renderCalendarEvents(){
 const el=$("calendarEventsList");if(!el)return;
 const categories=["CAT-I","CAT-II","Holidays","Instructional day","Other events"];
 const counts=Object.fromEntries(categories.map(c=>[c,calendarEvents.filter(e=>calendarCategory(e)===c).length]));
 if(!counts[selectedCalendarCategory] && !calendarEvents.some(e=>calendarCategory(e)===selectedCalendarCategory)){
   selectedCalendarCategory=categories.find(c=>counts[c]>0)||"Other events";
 }
 const controls=`<div class="subject-top" style="align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:14px"><div><div class="subject-name">Filter calendar events</div><div class="muted" style="font-size:12px">Choose a category to view only those events.</div></div><div style="display:flex;gap:8px;flex-wrap:wrap">${categories.map(c=>`<button type="button" class="${selectedCalendarCategory===c?"primary":"quiet"}" onclick="setCalendarCategory('${c}')">${c} (${counts[c]})</button>`).join("")}</div></div>`;
 const visible=calendarEvents.map((e,i)=>({e,i})).filter(({e})=>calendarCategory(e)===selectedCalendarCategory).sort((a,b)=>a.e.date.localeCompare(b.e.date));
 const list=visible.map(({e,i})=>`<div class="subject"><div class="subject-top"><div><div class="subject-name">${escapeAttr(e.title)}</div><div class="subject-code">${e.date} · ${escapeAttr(e.type)}${e.courseCode?" · "+escapeAttr(e.courseCode):""}</div></div><button class="quiet" onclick="deleteCalendarEvent(${i})">Delete</button></div></div>`).join("");
 el.innerHTML=controls+`<div class="muted" style="font-size:12px;margin-bottom:8px">Showing ${visible.length} ${escapeAttr(selectedCalendarCategory)} event(s).</div>`+(list||'<div class="muted" style="font-size:12px">No events in this category.</div>');
}
function deleteCalendarEvent(i){calendarEvents.splice(i,1);renderCalendarEvents();persistData();refreshExamClassCount();toast("Calendar event removed.");}
function renderScheduleMapping(){
 const el=$("scheduleMapping");if(!el)return;
 const dayNames=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
 el.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Subject</th>${dayNames.map(d=>`<th>${d}</th>`).join("")}</tr></thead><tbody>${subjects.map((s,i)=>`<tr><td><strong>${escapeAttr(s.name)}</strong><br><span class="muted">${escapeAttr(s.code)}</span></td>${dayNames.map((d,day)=>`<td><input type="checkbox" aria-label="${escapeAttr(s.name)} on ${d}" data-subject="${i}" data-day="${day}" ${Array.isArray(s.weeklyDays)&&s.weeklyDays.includes(day)?"checked":""}></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function saveScheduleMapping(){
 document.querySelectorAll("#scheduleMapping input[type=checkbox]").forEach(box=>{
   const s=subjects[Number(box.dataset.subject)],day=Number(box.dataset.day);
   if(!Array.isArray(s.weeklyDays))s.weeklyDays=[];
   s.weeklyDays=s.weeklyDays.filter(d=>d!==day);
   if(box.checked)s.weeklyDays.push(day);
   s.weeklyDays.sort((a,b)=>a-b);
 });
 persistData();refreshExamClassCount();toast("Weekly class-day mapping saved.");
}

$("dateLabel").textContent=new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase();
document.body.classList.add("dashboard-mode");makeCalendar("miniCalendar");makeCalendar("plannerCalendar");renderSubjects();renderExams();renderCalendarEvents();renderScheduleMapping();refreshExamClassCount();if($("safetyBuffer"))$("safetyBuffer").value=String(safetyBuffer);if($("timelineExamDate"))$("timelineExamDate").value=$("examDate").value;initSemesterRisk();


// ---- BunkSafe v3 backend integration ----
async function api(path, options={}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {"Content-Type":"application/json", ...(options.headers||{})},
    ...options
  });
  const data = await response.json().catch(()=>({error:"Unexpected server response"}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
function setBackendStatus(message, ok=true) {
  const el = document.getElementById("backendStatus");
  if (el) { el.textContent = message; el.style.borderColor = ok ? "#285d49" : "#7f3344"; }
}
function toggleAuthMode() {
  window.BunkSafeAuth.mode = window.BunkSafeAuth.mode === "login" ? "register" : "login";
  $("authTitle").textContent = window.BunkSafeAuth.mode === "login" ? "Sign in to BunkSafe" : "Create your student account";
  $("authSubmit").textContent = window.BunkSafeAuth.mode === "login" ? "Sign in" : "Create account";
  $("authSwitch").textContent = window.BunkSafeAuth.mode === "login" ? "Create student account" : "I already have an account";
  $("authNameWrap").classList.toggle("hidden", window.BunkSafeAuth.mode === "login");
  $("authPassword").autocomplete = window.BunkSafeAuth.mode === "login" ? "current-password" : "new-password";
  $("authError").textContent = "";
}
async function submitAuth() {
  if (window.BunkSafeAuth.submitting) return;
  const button = $("authSubmit");
  const errorBox = $("authError");
  errorBox.textContent = "";
  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPassword").value;
  const name = $("authName").value.trim();
  if (!email || !password) { errorBox.textContent = "Enter your email and password."; return; }
  if (window.BunkSafeAuth.mode === "register" && !name) { errorBox.textContent = "Enter your name."; return; }
  window.BunkSafeAuth.submitting = true;
  button.disabled = true;
  button.textContent = window.BunkSafeAuth.mode === "login" ? "Signing in…" : "Creating account…";
  try {
    const endpoint = window.BunkSafeAuth.mode === "login" ? "/api/login" : "/api/register";
    const result = await api(endpoint, { method: "POST", body: JSON.stringify({ email, password, name }) });
    currentUser = result.user;
    window.BunkSafeAuth.currentUser = result.user;
    await loadServerData();
    $("authOverlay").classList.add("hidden");
    applyRoleUI();
    setBackendStatus(`Signed in as ${currentUser.name || currentUser.email} · ${currentUser.role}`, true);
  } catch (e) {
    errorBox.textContent = e && e.message ? e.message : "Unable to sign in. Check that BunkSafe is running and try again.";
  } finally {
    window.BunkSafeAuth.submitting = false;
    button.disabled = false;
    button.textContent = window.BunkSafeAuth.mode === "login" ? "Sign in" : "Create account";
  }
}
async function logout() {
  try { await api("/api/logout", {method:"POST", body:"{}"}); } catch(e) {}
  currentUser = null;
  window.BunkSafeAuth.currentUser = null;
  $("authOverlay").classList.remove("hidden");
  setBackendStatus("Signed out. Sign in to sync your data.", true);
}
function applyRoleUI() {
  const adminNav = document.querySelector('[data-page="admin"]');
  if (adminNav) adminNav.classList.toggle("hidden", !currentUser || currentUser.role !== "admin");
  const mobileAdmin = document.querySelector('[data-mobile-admin]');
  if (mobileAdmin) mobileAdmin.classList.toggle("hidden", !currentUser || currentUser.role !== "admin");
  if (currentUser && currentUser.role !== "admin" && !$("adminPage").classList.contains("hidden")) showPage("dashboard");
  const avatar = document.querySelector(".avatar");
  if (avatar) avatar.textContent = (currentUser.name || currentUser.email || "S").slice(0,1).toUpperCase();
  const actions = document.querySelector(".top-actions");
  if (actions && !document.getElementById("logoutButton")) {
    const b = document.createElement("button");
    b.id="logoutButton"; b.className="quiet"; b.textContent="Sign out"; b.onclick=logout; actions.insertBefore(b, actions.firstChild);
  }
}
async function loadServerData() {
  const d = await api("/api/data");
  if (Array.isArray(d.subjects)) subjects.splice(0, subjects.length, ...d.subjects);
  plans = d.plans || [];
  publishedExams = d.exams || [];
  initSemesterRisk();
  calendarEvents = d.events || [];
  renderSubjects(); renderExams(); renderPlans(); renderCalendarEvents(); renderScheduleMapping(); if($("timelineExamDate"))$("timelineExamDate").value=$("examDate").value;
}
async function syncServerData() {
  if (!currentUser) return;
  try {
    await api("/api/data", {method:"PUT", body:JSON.stringify({subjects,plans,exams:publishedExams,events:calendarEvents})});
    setBackendStatus(`Synced · ${currentUser.name || currentUser.email} · ${currentUser.role}`, true);
  } catch(e) {
    setBackendStatus("Sync failed: " + e.message, false);
  }
}
// Replace persistence function to save to server after authentication.
const localPersistData = persistData;
persistData = function() {
  localPersistData();
  if (currentUser) syncServerData();
};
const oldPublishExam = publishExam;
publishExam = function() {
  if (!currentUser || currentUser.role !== "admin") { toast("Only the administrator can publish exams."); return; }
  oldPublishExam();
  syncServerData();
};
const oldAddCalendarEvent = addCalendarEvent;
addCalendarEvent = function() {
  if (!currentUser || currentUser.role !== "admin") { toast("Only the administrator can edit the semester calendar."); return; }
  oldAddCalendarEvent();
  syncServerData();
};
const oldDeleteExam = deleteExam;
deleteExam = function(i) {
  if (!currentUser || currentUser.role !== "admin") { toast("Only the administrator can delete exams."); return; }
  oldDeleteExam(i); syncServerData();
};
const oldDeleteCalendarEvent = deleteCalendarEvent;
deleteCalendarEvent = function(i) {
  if (!currentUser || currentUser.role !== "admin") { toast("Only the administrator can edit the semester calendar."); return; }
  oldDeleteCalendarEvent(i); syncServerData();
};
const oldSaveScheduleMapping = saveScheduleMapping;
saveScheduleMapping = function() { oldSaveScheduleMapping(); syncServerData(); };
const oldSaveParsedCourses = saveParsedCourses;
saveParsedCourses = function() { oldSaveParsedCourses(); syncServerData(); };
const oldSavePlan = savePlan;
savePlan = function() { oldSavePlan(); syncServerData(); };
const oldEditSubject = editSubject;
editSubject = function(i,k,v) { oldEditSubject(i,k,v); syncServerData(); };
const oldAddSubject = addSubject;
addSubject = function() { oldAddSubject(); syncServerData(); };
const oldRemoveSubject = removeSubject;
removeSubject = function(i) { oldRemoveSubject(i); syncServerData(); };
async function initBackend() {
  try {
    const state = await api("/api/me");
    if (state.user) {
      currentUser = state.user;
      window.BunkSafeAuth.currentUser = state.user;
      $("authOverlay").classList.add("hidden");
      await loadServerData();
      applyRoleUI();
      setBackendStatus(`Connected · ${currentUser.name || currentUser.email} · ${currentUser.role}`, true);
    } else {
      $("authOverlay").classList.remove("hidden");
      setBackendStatus("Server connected · sign in to sync your data.", true);
    }
  } catch(e) {
    $("authOverlay").classList.remove("hidden");
    setBackendStatus("Cannot reach the server. Start BunkSafe using run.bat or the instructions in README.", false);
  }
}
initBackend();


// CSV calendar import: parse, validate, preview, then explicitly commit as admin.
var calendarCsvRows = [];
const allowedCalendarTypes = new Set([
  "instructional", "slot-day", "holiday", "no-class", "monday-order",
  "tuesday-order", "wednesday-order", "thursday-order", "friday-order",
  "exam", "class-session", "class-cancelled"
]);
function parseCsvText(text) {
  const rows=[]; let row=[], cell="", quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted && text[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    } else if(ch===',' && !quoted){row.push(cell);cell="";}
    else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell); if(row.some(v=>v.trim()!==""))rows.push(row); row=[];cell="";
    } else cell+=ch;
  }
  if(quoted) throw new Error("CSV contains an unclosed quotation mark.");
  row.push(cell);if(row.some(v=>v.trim()!==""))rows.push(row);
  return rows;
}
function previewCalendarCsv(){
  const file=$("calendarCsvImport")?.files?.[0];
  const preview=$("calendarCsvPreview"), btn=$("importCalendarCsvBtn");
  calendarCsvRows=[];if(btn)btn.disabled=true;
  if(!file){preview.textContent="Choose a CSV file to validate and preview rows.";return;}
  if(file.size>2*1024*1024){preview.textContent="File is too large. Please use a CSV smaller than 2 MB.";return;}
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const rows=parseCsvText(String(reader.result||""));
      if(rows.length<2)throw new Error("CSV must include a header row and at least one data row.");
      const headers=rows[0].map(x=>x.trim().replace(/^\uFEFF/,""));
      const required=["date","type","title","courseCode"];
      const missing=required.filter(h=>!headers.includes(h));
      if(missing.length)throw new Error("Missing required column(s): "+missing.join(", "));
      const dateRe=/^\d{4}-\d{2}-\d{2}$/;
      const validated=[];const errors=[];
      rows.slice(1).forEach((cells,index)=>{
        const item={};headers.forEach((h,i)=>item[h]=(cells[i]||"").trim());
        const line=index+2;
        if(!dateRe.test(item.date)||Number.isNaN(Date.parse(item.date+"T00:00:00"))){errors.push("Row "+line+": date must use YYYY-MM-DD.");return;}
        const dateParts=item.date.split("-").map(Number);const d=new Date(Date.UTC(dateParts[0],dateParts[1]-1,dateParts[2]));if(d.getUTCFullYear()!==dateParts[0]||d.getUTCMonth()!==dateParts[1]-1||d.getUTCDate()!==dateParts[2]){errors.push("Row "+line+": invalid calendar date.");return;}
        item.type=item.type.toLowerCase();item.courseCode=item.courseCode.toUpperCase();
        if(!allowedCalendarTypes.has(item.type)){errors.push("Row "+line+": unsupported type '"+item.type+"'.");return;}
        if(!item.title){errors.push("Row "+line+": title cannot be empty.");return;}
        if(["class-session","class-cancelled"].includes(item.type)&&!item.courseCode){errors.push("Row "+line+": courseCode is required for "+item.type+".");return;}
        if(item.type==="slot-day"){
          const codes=item.title.toUpperCase().split(/[+,\s;|/]+/).filter(Boolean);
          if(!codes.length||codes.some(x=>!/[A-Z]{1,3}\d{1,2}/.test(x))){errors.push("Row "+line+": slot-day title should contain codes such as D2, TD2.");return;}
        }
        validated.push({date:item.date,type:item.type,title:item.title,courseCode:["class-session","class-cancelled"].includes(item.type)?item.courseCode:""});
      });
      calendarCsvRows=validated;
      const sample=validated.slice(0,8).map(e=>`<div class="subject"><div class="subject-top"><div><div class="subject-name">${escapeAttr(e.title)}</div><div class="subject-code">${e.date} · ${escapeAttr(e.type)}${e.courseCode?" · "+escapeAttr(e.courseCode):""}</div></div><span class="pill green">Valid</span></div></div>`).join("");
      preview.innerHTML=`<p><strong>${validated.length}</strong> valid row(s); <strong>${errors.length}</strong> invalid row(s).</p>${sample}${validated.length>8?`<p>Showing first 8 valid rows.</p>`:""}${errors.length?`<div class="notice" style="margin-top:10px"><strong>Fix these rows before importing:</strong><ul>${errors.slice(0,10).map(e=>`<li>${escapeAttr(e)}</li>`).join("")}</ul>${errors.length>10?`<p>And ${errors.length-10} more error(s).</p>`:""}</div>`:""}`;
      if(btn)btn.disabled=validated.length===0||errors.length>0;
    }catch(e){preview.textContent="Could not read CSV: "+e.message;calendarCsvRows=[];}
  };
  reader.onerror=()=>{preview.textContent="Unable to read the selected file.";};
  reader.readAsText(file);
}
function importCalendarCsv(){
  if(!currentUser||currentUser.role!=="admin"){toast("Only the administrator can import shared calendar events.");return;}
  if(!calendarCsvRows.length){toast("Choose and validate a CSV file first.");return;}
  const existing=new Set(calendarEvents.map(e=>[e.date,e.type,e.title,e.courseCode||""].join("|")));
  let added=0,skipped=0;
  calendarCsvRows.forEach(e=>{const key=[e.date,e.type,e.title,e.courseCode||""].join("|");if(existing.has(key)){skipped++;return;}calendarEvents.push(e);existing.add(key);added++;});
  calendarEvents.sort((a,b)=>a.date.localeCompare(b.date));
  renderCalendarEvents();persistData();refreshExamClassCount();syncServerData();
  toast(`Imported ${added} event(s); skipped ${skipped} duplicate(s).`);
  calendarCsvRows=[];$("calendarCsvImport").value="";$("importCalendarCsvBtn").disabled=true;$("calendarCsvPreview").textContent="Import complete. Select another CSV to continue.";
}
function downloadCalendarCsvTemplate(){
  const content='date,type,title,courseCode\n2026-11-01,holiday,Diwali holiday,\n2026-11-02,slot-day,"D2, TD2",\n2026-11-03,class-session,Extra DBMS lecture,BCSE302L\n';
  const blob=new Blob([content],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="BunkSafe_calendar_template.csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}


// Attendance CSV import/export (v9). Import only applies after explicit preview confirmation.
var attendanceCsvRecords = [];
function downloadAttendanceCsvTemplate(){
 const content='courseCode,courseName,attended,total,required,kind,slot\nBCSE302L,Database Systems,30,37,75,Theory,D2+TD2\n';
 const blob=new Blob([content],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='BunkSafe_attendance_template.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function exportAttendanceCsv(){
 const rows=[['courseCode','courseName','attended','total','required','kind','slot']];
 subjects.forEach(s=>rows.push([s.code||'',s.name||'',s.attended,s.total,s.required??75,s.kind||'',s.slot||'']));
 const csv=rows.map(row=>row.map(v=>{const x=String(v??'');return /[",\r\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x;}).join(',')).join('\r\n');
 const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='BunkSafe_attendance.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Attendance CSV exported.');
}
function previewAttendanceCsv(){
 const file=$('attendanceCsvFile')?.files?.[0],preview=$('attendanceCsvPreview'),btn=$('applyAttendanceCsv');attendanceCsvRecords=[];if(btn)btn.disabled=true;if(!preview){toast('CSV preview area is missing. Refresh BunkSafe and try again.');return;}preview.textContent='Reading and validating CSV…';
 if(!file){preview.textContent='Choose a CSV file to validate and preview attendance records.';return;}
 if(file.size>2*1024*1024){preview.textContent='File is too large. Choose a CSV smaller than 2 MB.';return;}
 const reader=new FileReader();reader.onload=()=>{
  try{
   const rows=parseCsvText(String(reader.result||''));if(rows.length<2)throw new Error('CSV needs a header row and at least one data row.');
   const headers=rows[0].map(v=>v.trim().replace(/^\uFEFF/,''));const requiredHeaders=['courseCode','courseName','attended','total'];const missing=requiredHeaders.filter(h=>!headers.includes(h));if(missing.length)throw new Error('Missing required columns: '+missing.join(', '));
   const records=[],errors=[],seen=new Set();
   rows.slice(1).forEach((cells,i)=>{const row={};headers.forEach((h,j)=>row[h]=(cells[j]||'').trim());const line=i+2;const code=(row.courseCode||'').toUpperCase();const name=row.courseName||'';const blankCounts=String(row.attended||'').trim()===''&&String(row.total||'').trim()==='';const attended=blankCounts?0:Number(row.attended),total=blankCounts?0:Number(row.total);const req=row.required===''||row.required==null?75:Number(row.required);
    if(!code||!name){errors.push('Row '+line+': courseCode and courseName are required.');return;}
    if(seen.has(code)){errors.push('Row '+line+': duplicate course code '+code+'.');return;}seen.add(code);
    if(!Number.isInteger(attended)||!Number.isInteger(total)||(!blankCounts&&total<1)||attended<0||attended>total){errors.push('Row '+line+': attended and total must be whole numbers; leave both blank for a course with no attendance data, or use 0 ≤ attended ≤ total with total ≥ 1.');return;}
    if(!Number.isFinite(req)||req<1||req>100){errors.push('Row '+line+': required must be between 1 and 100.');return;}
    records.push({code,name,attended,total,required:req,kind:row.kind||'Theory',slot:row.slot||'',countsBlank:blankCounts});
   });
   attendanceCsvRecords=records;
   const html=records.slice(0,8).map(r=>`<div class="subject"><div class="subject-top"><div><div class="subject-name">${escapeAttr(r.name)}</div><div class="subject-code">${escapeAttr(r.code)} · ${r.attended}/${r.total} attended · ${r.total?((100*r.attended/r.total).toFixed(1)+'%'):'No attendance data'}</div></div><span class="pill green">Valid</span></div></div>`).join('');
   const blankCountRows=records.filter(r=>r.countsBlank).length;preview.innerHTML=`<p><strong>${records.length}</strong> valid row(s); <strong>${errors.length}</strong> invalid row(s).</p>${blankCountRows?`<p>${blankCountRows} row(s) have blank attendance counts and will be imported as 0/0 until you enter official figures.</p>`:''}${html}${records.length>8?'<p>Showing the first 8 valid rows.</p>':''}${errors.length?`<div class="notice"><strong>Fix these rows before importing:</strong><ul>${errors.slice(0,10).map(e=>'<li>'+escapeAttr(e)+'</li>').join('')}</ul>${errors.length>10?'<p>And '+(errors.length-10)+' more error(s).</p>':''}</div>`:''}`;
   btn.disabled=records.length===0||errors.length>0;
  }catch(e){preview.textContent='Could not read CSV: '+(e&&e.message?e.message:String(e));attendanceCsvRecords=[];if(btn)btn.disabled=true;}
 };
 reader.onerror=()=>{preview.textContent='Unable to read the selected file. Try saving it as a standard UTF-8 CSV and select it again.';attendanceCsvRecords=[];if(btn)btn.disabled=true;}; try { reader.readAsText(file); } catch(e) { preview.textContent='Could not start CSV reading: '+e.message; attendanceCsvRecords=[]; if(btn)btn.disabled=true; }
}
function applyAttendanceCsvImport(){
 if(!currentUser){toast('Sign in before importing attendance.');return;}
 if(!attendanceCsvRecords.length){toast('Choose and validate a CSV first.');return;}
 let added=0,updated=0;
 attendanceCsvRecords.forEach(r=>{const existing=subjects.find(s=>String(s.code||'').trim().toUpperCase()===r.code);if(existing){existing.attended=r.attended;existing.total=r.total;existing.required=r.required;existing.name=r.name;existing.kind=r.kind;existing.slot=r.slot||existing.slot||'';updated++;}else{subjects.push({name:r.name,code:r.code,kind:r.kind,attended:r.attended,total:r.total,required:r.required,slot:r.slot,weeklyDays:[]});added++;}});
 renderSubjects();persistData();syncServerData();attendanceCsvRecords=[];$('attendanceCsvFile').value='';$('applyAttendanceCsv').disabled=true;$('attendanceCsvPreview').textContent=`Import applied: ${added} new subject(s), ${updated} updated subject(s).`;toast(`Attendance imported: ${added} added, ${updated} updated.`);
}


// v11: semester-wide attendance risk simulation
let semesterRiskRows = [];
function localISODate(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function initSemesterRisk(){
 const input=$('semesterRiskDate');
 if(!input)return;
 const next=publishedExams.filter(e=>e.date&&e.date>=localISODate(new Date())).sort((a,b)=>a.date.localeCompare(b.date))[0];
 if(next)input.value=next.date;
 else {const d=new Date();d.setDate(d.getDate()+30);input.value=localISODate(d);}
 const buf=$('semesterRiskBuffer');if(buf)buf.value=String(safetyBuffer);
}
async function runSemesterRiskSimulation(){
 const date=$('semesterRiskDate')?.value;
 if(!date){toast('Choose the target exam date first.');return;}
 const buffer=Number($('semesterRiskBuffer')?.value||0);
 if(!subjects.length){$('semesterRiskSummary').textContent='No subjects are configured yet. Import or add your subjects first.';$('semesterRiskTable').innerHTML='';semesterRiskRows=[];return;}
 const summary=$('semesterRiskSummary');
 summary.textContent='Calculating dated class sessions on the server for each subject…';
 const startDate=localISODate(new Date());
 try {
   const timelines=await Promise.all(subjects.map(async subject=>{
     const response=await fetch('/api/schedule/preview',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({subject,events:calendarEvents,startDate,examDate:date})});
     const result=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(result.error||`Schedule calculation failed (${response.status}).`);
     return {subject,future:Number(result.sessionsCounted)||0,daysChecked:Number(result.daysChecked)||0};
   }));
   semesterRiskRows=timelines.map(({subject:s,future})=>{
     const total=Number(s.total)||0,attended=Number(s.attended)||0,required=Number(s.required)||75;
     const current=total>0?100*attended/total:0;
     const projected=future>0?100*(attended+future)/(total+future):current;
     const target=Math.min(100,required+buffer);
     const raw=Math.floor(attended+future-(target/100)*(total+future)+1e-9);
     const maxBunks=Math.max(0,Math.min(future,raw));
     let recoverMin=0,recoverTarget=0;
     if(total>0&&current<required&&required<100)recoverMin=Math.max(0,Math.ceil(((required/100)*total-attended)/(1-required/100)-1e-9));
     if(total>0&&current<target&&target<100)recoverTarget=Math.max(0,Math.ceil(((target/100)*total-attended)/(1-target/100)-1e-9));
     const status=projected<required?'At risk':projected<target?'Low buffer':'On track';
     return {code:String(s.code||''),name:String(s.name||''),current,future,projected,required,target,maxBunks,recoverMin,recoverTarget,status,total,attended};
   }).sort((a,b)=>{const rank={'At risk':0,'Low buffer':1,'On track':2};return rank[a.status]-rank[b.status]||a.projected-b.projected||a.name.localeCompare(b.name);});
   const atRisk=semesterRiskRows.filter(r=>r.status==='At risk').length;
   const low=semesterRiskRows.filter(r=>r.status==='Low buffer').length;
   summary.innerHTML=`<b>Analysis for ${escapeAttr(date)}</b><br>${semesterRiskRows.length} subject(s) checked using server-side dated sessions · <b>${atRisk}</b> projected below the required minimum · <b>${low}</b> meeting the minimum but below the ${buffer}-point safety buffer · ${semesterRiskRows.filter(r=>r.future===0).length} subject(s) with no future sessions counted. Highest priority: <b>${escapeAttr(semesterRiskRows[0]?.name||'—')}</b>.`;
   $('semesterRiskTable').innerHTML=`<table><thead><tr><th>Priority / subject</th><th>Now</th><th>Future classes</th><th>Projected if all attended</th><th>Safe absences</th><th>Recovery classes</th><th>Status</th></tr></thead><tbody>${semesterRiskRows.map((r,i)=>`<tr><td><strong>${i+1}. ${escapeAttr(r.name)}</strong><br><span class="muted">${escapeAttr(r.code)}</span></td><td>${r.current.toFixed(1)}%</td><td>${r.future}</td><td>${r.projected.toFixed(1)}%</td><td>${r.maxBunks}</td><td>${r.current<r.required?`${r.recoverMin} to minimum`:'—'}${r.current<r.target?`<br>${r.recoverTarget} to buffer`:''}</td><td><span class="pill ${r.status==='At risk'?'red':r.status==='Low buffer'?'yellow':'green'}">${r.status}</span></td></tr>`).join('')}</tbody></table>`;
 } catch(error) {
   semesterRiskRows=[];
   $('semesterRiskTable').innerHTML='';
   summary.textContent=`Server-side semester analysis failed: ${error.message} Please sign in again, verify the exam date, and retry. No browser-side fallback was used.`;
 }
}
function exportSemesterRiskCsv(){
 if(!semesterRiskRows.length){runSemesterRiskSimulation();if(!semesterRiskRows.length)return;}
 const headers=['priority','courseCode','courseName','currentAttendancePercent','futureClassesBeforeExam','projectedIfAllAttendedPercent','requiredPercent','safetyTargetPercent','estimatedSafeAbsences','classesToRecoverMinimum','classesToRecoverSafetyTarget','status'];
 const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`;
 const rows=semesterRiskRows.map((r,i)=>[i+1,r.code,r.name,r.current.toFixed(2),r.future,r.projected.toFixed(2),r.required,r.target,r.maxBunks,r.recoverMin,r.recoverTarget,r.status]);
 const csv=[headers,...rows].map(row=>row.map(esc).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='BunkSafe_semester_risk_analysis.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Semester risk CSV exported.');
}


// v12: Personalized attendance action plan based on the semester risk analysis.
let attendanceActionRows = [];
function buildAttendanceActionPlan(){
  if(!semesterRiskRows.length) runSemesterRiskSimulation();
  if(!semesterRiskRows.length){toast('Add subjects and run the semester simulator first.');return;}
  const examDate=$('semesterRiskDate')?.value||'';
  attendanceActionRows=semesterRiskRows.map(r=>{
    let priority='Maintain', action='Keep attending scheduled sessions; preserve your current buffer.', urgency=3;
    if(r.future===0){priority='Verify timetable';action='No future sessions were counted. Check the weekday/slot mapping and academic calendar before using this result.';urgency=0;}
    else if(r.projected<r.required-1e-9){priority='Critical';action=r.current<r.required && r.recoverMin>r.future ? 'Attend every remaining session and contact your faculty/academic office: the current figures suggest the minimum may not be recoverable before this exam.' : 'Attend every remaining session. Do not plan absences; verify your attendance and class count with the official record.';urgency=1;}
    else if(r.current<r.required-1e-9){priority='Recover';action=`Attend every session until at least ${r.recoverMin} consecutive classes have been attended; avoid discretionary absences while recovering.`;urgency=1;}
    else if(r.projected<r.target-1e-9 || r.status==='Low buffer'){priority='Protect buffer';action=`Avoid discretionary absences. If you must miss a class, keep absences within the estimated limit of ${r.maxBunks} out of ${r.future} remaining sessions.`;urgency=2;}
    else {priority='Maintain';action=`Estimated margin: ${r.maxBunks} absence(s) across ${r.future} counted future sessions. Keep a reserve rather than using the full margin.`;urgency=3;}
    return {...r,priority,action,urgency,examDate};
  }).sort((a,b)=>a.urgency-b.urgency||a.projected-b.projected||a.name.localeCompare(b.name));
  const critical=attendanceActionRows.filter(r=>r.urgency===1).length, verify=attendanceActionRows.filter(r=>r.urgency===0).length;
  $('attendanceActionSummary').innerHTML=`<b>Action plan for ${escapeAttr(examDate)}</b><br>${attendanceActionRows.length} subject(s) reviewed · <b>${critical}</b> urgent subject(s) · <b>${verify}</b> subject(s) need timetable verification. Start with the first action below.`;
  $('attendanceActionList').innerHTML=attendanceActionRows.map((r,i)=>`<div class="subject" style="margin-bottom:10px"><div class="subject-top"><div><div class="subject-name">${i+1}. ${escapeAttr(r.name)} <span class="pill ${r.urgency===1?'red':r.urgency===0?'yellow':r.urgency===2?'yellow':'green'}">${escapeAttr(r.priority)}</span></div><div class="subject-code">${escapeAttr(r.code)} · Current ${r.current.toFixed(1)}% · projected ${r.projected.toFixed(1)}% · ${r.future} future class(es)</div></div><div class="percent ${r.projected<r.required?'red':r.projected<r.target?'yellow':'green'}">${r.maxBunks} <span class="muted" style="font-size:10px">safe absence estimate</span></div></div><p style="font-size:12px;line-height:1.55;margin:10px 0 0">${escapeAttr(r.action)}</p></div>`).join('');
  toast('Personalized attendance action plan created.');
}
function exportAttendanceActionPlan(){
  if(!attendanceActionRows.length) buildAttendanceActionPlan(); if(!attendanceActionRows.length)return;
  const headers=['priorityOrder','courseCode','courseName','examDate','currentAttendancePercent','projectedAttendancePercent','requiredPercent','safetyTargetPercent','futureSessionsCounted','estimatedSafeAbsences','priority','recommendedAction'];
  const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const rows=attendanceActionRows.map((r,i)=>[i+1,r.code,r.name,r.examDate,r.current.toFixed(2),r.projected.toFixed(2),r.required,r.target,r.future,r.maxBunks,r.priority,r.action]);
  const csv=[headers,...rows].map(row=>row.map(esc).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='BunkSafe_personalized_action_plan.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Attendance action plan exported.');
}


// v14: Local data-quality validation for attendance, timetable mappings, and calendar events.
let validationRows=[];
function runDataValidation(){
  validationRows=[];
  const add=(severity,area,code,message,fix)=>validationRows.push({severity,area,code,message,fix});
  const seen=new Map();
  subjects.forEach((s,i)=>{
    const code=String(s.code||'').trim().toUpperCase();
    if(!code)add('error','Subject','MISSING_CODE',`Subject row ${i+1} has no course code.`,`Edit the subject and add the exact course code from VTOP.`);
    else if(seen.has(code))add('error','Subject','DUPLICATE_CODE',`Course code ${code} appears more than once.`,`Keep one record per course code and merge attendance values carefully.`);
    else seen.set(code,i);
    const attended=Number(s.attended),total=Number(s.total),required=Number(s.required);
    if(!Number.isInteger(attended)||!Number.isInteger(total)||total<1||attended<0||attended>total)add('error','Attendance',`INVALID_ATTENDANCE_${code||i}`,`${s.name||code||'Subject'} has invalid attendance counts (${s.attended}/${s.total}).`,`Use whole-number counts with total ≥ 1 and 0 ≤ attended ≤ total.`);
    if(!Number.isFinite(required)||required<=0||required>100)add('error','Attendance',`INVALID_THRESHOLD_${code||i}`,`${s.name||code||'Subject'} has an invalid required attendance threshold.`,`Set a threshold greater than 0 and no more than 100%.`);
    const days=Array.isArray(s.weeklyDays)?s.weeklyDays:[];
    const slot=String(s.slot||'').trim();
    if(!days.length&&!slot)add('warning','Timetable',`NO_MAPPING_${code||i}`,`${s.name||code||'Subject'} has neither weekly weekday mapping nor a slot code.`,`Add a verified weekly mapping or the exact slot code and configure active-slot dates.`);
    else if(!days.length&&slot)add('warning','Timetable',`SLOT_ONLY_${code||i}`,`${s.name||code||'Subject'} has slot code ${slot} but no weekly mapping.`,`Ensure active-slot calendar events cover the dates before each exam; otherwise the planner may count zero sessions on those dates.`);
    if(days.some(d=>!Number.isInteger(d)||d<0||d>6))add('error','Timetable',`INVALID_DAYS_${code||i}`,`${s.name||code||'Subject'} has an invalid weekday mapping.`,`Use weekday numbers 0–6, where 0 is Sunday and 6 is Saturday.`);
  });
  const allowed=new Set(['slot-day','holiday','no-class','monday-order','tuesday-order','wednesday-order','thursday-order','friday-order','exam','class-session','class-cancelled','instructional']);
  const byDate=new Map(), eventKeys=new Set();
  calendarEvents.forEach((e,i)=>{
    const date=String(e.date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(date+'T00:00:00').getTime()))add('error','Calendar',`BAD_DATE_${i}`,`Calendar event row ${i+1} has an invalid date (${date||'empty'}).`,`Use a real date in YYYY-MM-DD format.`);
    if(!allowed.has(e.type))add('error','Calendar',`BAD_TYPE_${i}`,`Calendar event on ${date||'unknown date'} has unsupported type ${e.type||'(empty)'}.`,`Choose a supported calendar event type.`);
    if(['class-session','class-cancelled'].includes(e.type)&&!String(e.courseCode||'').trim())add('error','Calendar',`OVERRIDE_NO_CODE_${i}`,`Subject-specific event on ${date} has no course code.`,`Add the exact subject course code or remove the event.`);
    if(e.type==='slot-day'&&!String(e.title||'').trim())add('error','Calendar',`SLOT_EMPTY_${i}`,`Active-slot event on ${date} has no slot codes.`,`Enter verified active slot codes such as D2, TD2.`);
    const key=[date,e.type,String(e.courseCode||'').trim().toUpperCase(),String(e.title||'').trim().toUpperCase()].join('|');
    if(eventKeys.has(key))add('warning','Calendar',`DUPLICATE_EVENT_${i}`,`A duplicate calendar event is present on ${date}: ${e.title||e.type}.`,`Remove the duplicate entry to keep the calendar clear.`); else eventKeys.add(key);
    if(!byDate.has(date))byDate.set(date,[]);byDate.get(date).push(e);
  });
  for(const [date,events] of byDate){
    const types=new Set(events.map(e=>e.type));
    if((types.has('holiday')||types.has('no-class'))&&(types.has('class-session')||types.has('slot-day')||[...types].some(t=>t.endsWith('-order'))))add('warning','Calendar',`DATE_CONFLICT_${date}`,`${date} contains a holiday/no-class event and another event that may imply classes.`,`Confirm the official calendar. Holidays currently take precedence in the class-counting logic.`);
    const overrides=events.filter(e=>['class-session','class-cancelled'].includes(e.type));
    const overrideCodes=overrides.map(e=>String(e.courseCode||'').trim().toUpperCase()).filter(Boolean);
    if(new Set(overrideCodes).size<overrideCodes.length||overrides.some((e,i)=>overrides.slice(i+1).some(x=>String(x.courseCode||'').trim().toUpperCase()===String(e.courseCode||'').trim().toUpperCase())))add('warning','Calendar',`MULTIPLE_OVERRIDES_${date}`,`${date} has multiple session overrides for the same course.`,`Keep only the final intended override for each course on this date.`);
    const orders=events.filter(e=>['monday-order','tuesday-order','wednesday-order','thursday-order','friday-order'].includes(e.type));
    if(orders.length>1)add('warning','Calendar',`MULTIPLE_ORDERS_${date}`,`${date} has multiple weekday timetable substitutions.`,`Choose one official timetable order for this date.`);
    if(events.filter(e=>e.type==='slot-day').length>1)add('warning','Calendar',`MULTIPLE_SLOT_DAYS_${date}`,`${date} has multiple active-slot entries.`,`Combine verified slot codes into one event for this date.`);
  }
  const errors=validationRows.filter(r=>r.severity==='error').length,warnings=validationRows.filter(r=>r.severity==='warning').length;
  const summary=$('validationSummary'),list=$('validationResults');
  summary.innerHTML=`Validation complete: <b>${validationRows.length}</b> finding(s) — <b>${errors}</b> error(s), <b>${warnings}</b> warning(s). ${errors?'Fix errors before relying on estimates.':warnings?'Review warnings and verify the official timetable.':'No issues found by these checks; still verify against VTOP.'}`;
  list.innerHTML=validationRows.length?validationRows.map((r,i)=>`<div class="subject" style="margin-bottom:9px"><div class="subject-top"><div><div class="subject-name"><span class="pill ${r.severity==='error'?'red':'yellow'}">${r.severity.toUpperCase()}</span> ${escapeAttr(r.area)} · ${escapeAttr(r.code)}</div><div style="font-size:12px;line-height:1.5;margin-top:7px">${escapeAttr(r.message)}</div><div class="muted" style="font-size:11px;line-height:1.5;margin-top:5px">Suggested fix: ${escapeAttr(r.fix)}</div></div></div></div>`).join(''):'<div class="subject"><div class="subject-name">No issues detected by the available checks.</div><div class="muted" style="font-size:12px;margin-top:6px">This does not verify the data against official VIT records.</div></div>';
  toast(`Validation complete: ${errors} error(s), ${warnings} warning(s).`);
}
async function runServerTimetableAudit(){
  const summary=$('validationSummary'), list=$('validationResults');
  summary.textContent='Running server-side timetable audit…';
  try {
    const result=await api('/api/timetable/validate', {method:'POST', body:JSON.stringify({subjects,events:calendarEvents})});
    const serverRows=(Array.isArray(result.findings)?result.findings:[]).map((r,i)=>({
      severity:r.severity==='error'?'error':'warning',
      area:'Server timetable audit',
      code:String(r.code||`SERVER_FINDING_${i+1}`),
      message:`${r.subject?String(r.subject)+': ':''}${String(r.message||'Validation finding')}`,
      fix:'Review the course slot, weekday mapping, and calendar entries against your verified timetable.'
    }));
    validationRows=validationRows.filter(r=>r.area!=='Server timetable audit').concat(serverRows);
    const errors=serverRows.filter(r=>r.severity==='error').length;
    const warnings=serverRows.filter(r=>r.severity==='warning').length;
    summary.innerHTML=`Server audit complete: <b>${serverRows.length}</b> finding(s) — <b>${errors}</b> error(s), <b>${warnings}</b> warning(s). ${errors?'Correct errors before relying on estimates.':warnings?'Review warnings and verify against VTOP.':'No server-side mapping issues detected by these checks.'}`;
    list.innerHTML=serverRows.length?serverRows.map(r=>`<div class="subject" style="margin-bottom:9px"><div class="subject-top"><div><div class="subject-name"><span class="pill ${r.severity==='error'?'red':'yellow'}">${r.severity.toUpperCase()}</span> ${escapeAttr(r.area)} · ${escapeAttr(r.code)}</div><div style="font-size:12px;line-height:1.5;margin-top:7px">${escapeAttr(r.message)}</div><div class="muted" style="font-size:11px;line-height:1.5;margin-top:5px">Suggested fix: ${escapeAttr(r.fix)}</div></div></div></div>`).join(''):'<div class="subject"><div class="subject-name">No server-side findings.</div><div class="muted" style="font-size:12px;margin-top:6px">This does not verify the data against official VIT records.</div></div>';
    toast(`Server audit complete: ${errors} error(s), ${warnings} warning(s).`);
  } catch(error) {
    summary.textContent=`Server audit failed: ${error.message}. Run the local validation instead, and confirm you are signed in.`;
    toast('Server audit could not complete.');
  }
}
function exportValidationCsv(){
  if(!validationRows.length)runDataValidation();
  const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const rows=[['severity','area','code','finding','suggested_fix'],...validationRows.map(r=>[r.severity,r.area,r.code,r.message,r.fix])];
  const csv=rows.map(row=>row.map(esc).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='BunkSafe_data_validation.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Validation report exported.');
}
