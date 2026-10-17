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
const STORE_KEY="bunksafe-prototype-v2";
function persistData(){try{localStorage.setItem(STORE_KEY,JSON.stringify({subjects,plans,publishedExams,calendarEvents}));}catch(e){}}
function restoreData(){try{const d=JSON.parse(localStorage.getItem(STORE_KEY)||"null");if(d){if(Array.isArray(d.subjects)&&d.subjects.length){subjects.splice(0,subjects.length,...d.subjects)}if(Array.isArray(d.plans))plans=d.plans;if(Array.isArray(d.publishedExams))publishedExams=d.publishedExams;if(Array.isArray(d.calendarEvents))calendarEvents=d.calendarEvents;}}catch(e){}}
restoreData();
const $=id=>document.getElementById(id);
function pct(s){return s.total?100*s.attended/s.total:0}
function safeMiss(s,future){return Math.max(0,Math.floor((s.attended+s.total+future)-(s.attended+s.total+future)*s.required/100)-1)}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2800)}
function showPage(page){document.querySelectorAll("main section").forEach(s=>s.classList.add("hidden"));$(page+"Page").classList.remove("hidden");document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));const titles={dashboard:"Your semester at a glance",timetable:"Import your timetable",planner:"Plan your next absence",subjects:"Your subjects",exams:"Plan safely before exams",admin:"Semester calendar administration"};$("pageTitle").textContent=titles[page];if(page==="subjects")renderSubjectsTable();if(page==="planner")renderPlans();if(page==="timetable")renderScheduleMapping();if(page==="admin")renderCalendarEvents();if(page==="exams")refreshExamClassCount();window.scrollTo({top:0,behavior:"smooth"})}
document.querySelectorAll(".nav button").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
function populateSelects(){["quickSubject","planSubject","examSubject"].forEach(id=>{const el=$(id),old=el.value;el.innerHTML=subjects.map((s,i)=>`<option value="${i}">${s.name} (${s.code})</option>`).join("");if(old)el.value=old})}
function renderSubjects(){const average=subjects.reduce((a,s)=>a+pct(s),0)/subjects.length;$("averageStat").textContent=average.toFixed(1)+"%";$("riskStat").textContent=subjects.filter(s=>pct(s)<s.required+5).length;$("plansStat").textContent=plans.length;$("subjectList").innerHTML=subjects.slice(0,6).map(s=>{const p=pct(s),color=p<s.required?"red":p<s.required+5?"yellow":"green";return `<div class="subject"><div class="subject-top"><div><div class="subject-name">${s.name}</div><div class="subject-code">${s.code} · ${s.kind} · ${s.attended}/${s.total} attended</div></div><div style="text-align:right"><div class="percent ${color}">${p.toFixed(0)}%</div><span class="pill ${color}">${p<s.required?"At risk":p<s.required+5?"Low buffer":"On track"}</span></div></div><div class="progress"><span style="width:${Math.min(100,p)}%;background:${p<s.required?"linear-gradient(90deg,#fb7185,#f43f5e)":p<s.required+5?"linear-gradient(90deg,#fbbf24,#f59e0b)":""}"></span></div><div class="subject-bottom"><span>${s.total-s.attended} classes missed so far</span><span>${s.required}% required</span></div></div>`}).join("");populateSelects();renderSubjectsTable()}
function renderSubjectsTable(){$("subjectsTable").innerHTML=subjects.map((s,i)=>`<tr><td><strong>${s.name}</strong><br><span class="muted">${s.code} · ${s.kind}</span></td><td><input aria-label="Attended classes" type="number" min="0" max="${s.total}" value="${s.attended}" style="width:70px;background:#0b1220;color:#fff;border:1px solid #34415c;border-radius:7px;padding:7px" onchange="editSubject(${i},'attended',this.value)"></td><td><input aria-label="Total classes" type="number" min="1" value="${s.total}" style="width:70px;background:#0b1220;color:#fff;border:1px solid #34415c;border-radius:7px;padding:7px" onchange="editSubject(${i},'total',this.value)"></td><td><strong>${pct(s).toFixed(1)}%</strong></td><td>${s.required}%</td><td><button class="quiet" onclick="removeSubject(${i})">Remove</button></td></tr>`).join("")}
function editSubject(i,k,v){let n=Number(v);if(!Number.isFinite(n)||n<0){toast("Enter a valid non-negative number.");renderSubjectsTable();return}if(k==="total"&&n<1)n=1;if(k==="total"&&n<subjects[i].attended){toast("Total classes cannot be lower than attended classes.");renderSubjectsTable();return}if(k==="attended"&&n>subjects[i].total){toast("Attended classes cannot exceed total classes.");renderSubjectsTable();return}subjects[i][k]=Math.floor(n);renderSubjects();toast("Attendance updated.")}
function addSubject(){const name=prompt("Subject name:");if(!name)return;const code=prompt("Course code (optional):")||"CUSTOM";const attended=Number(prompt("Classes attended:", "0"));const total=Number(prompt("Total classes conducted:", "1"));if(!Number.isFinite(attended)||!Number.isFinite(total)||attended<0||total<1||attended>total){toast("Invalid attendance values.");return}subjects.push({name,code,kind:"Theory",attended,total,required:75});renderSubjects();toast("Subject added.")}
function removeSubject(i){if(confirm("Remove "+subjects[i].name+"?")){subjects.splice(i,1);renderSubjects();persistData();toast("Subject removed.")}}
function quickCalculate(){const s=subjects[Number($("quickSubject").value)];if(!s)return;const f=Math.max(0,Math.floor(Number($("quickFuture").value)||0)),m=Math.max(0,Math.floor(Number($("quickMiss").value)||0));if(f<1||m>f){toast("Missed classes must be between 0 and upcoming classes.");return}const p=100*(s.attended+f-m)/(s.total+f);showResult("quickResult",p,s.required,s,m,f)}
function showResult(id,p,required,s,m,f){const el=$(id),safe=p>=required;el.classList.add("show");el.innerHTML=`<div class="muted" style="font-size:10px">PROJECTED ATTENDANCE · ${s.name}</div><strong class="${safe?"good":"bad"}">${p.toFixed(2)}%</strong><p>${safe?`Projected above the ${required}% minimum.`:`Projected below the ${required}% minimum. This plan is risky.`} ${m} missed and ${f-m} attended out of ${f} future classes.</p>`}
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
function parseTimetable(){const raw=$("timetableText").value.trim();if(!raw){toast("Paste timetable text first.");return}const lines=raw.split(/\n+/).map(x=>x.trim()).filter(Boolean);parsed=[];for(const line of lines){const codeMatch=line.match(/\b([A-Z]{2,5}\d{3,4}[LP]?)\b/);if(!codeMatch)continue;const code=codeMatch[1];let name="";const after=line.indexOf(code)+code.length;let tail=line.slice(after);tail=tail.replace(/^\s*[-:]\s*/,"");name=(tail.split(/\s+\(/)[0]||"").replace(/\s{2,}/g," ").trim();if(!name)name=code;const slots=(line.match(/\b(?:[A-Z]{1,3}\d{1,2})(?:\s*\+\s*[A-Z]{1,3}\d{1,2})*\b/g)||[]).filter(x=>!x.includes(code));const slot=slots.find(x=>/[A-Z]+\d/.test(x)&&!/^SJT\d+|^PRP\d+|^SIT\d+/.test(x))||"Review required";const kind=/Lab Only/i.test(line)||/[LP]\s+-/.test(code)?"Lab":/Theory Only/i.test(line)?"Theory":"Review";parsed.push({code,name,slot,kind,line})}const msg=$("parseMessage");msg.classList.remove("hidden");if(!parsed.length){msg.textContent="We could not identify course codes in this text. Try copying the table again or use the sample format.";return}msg.textContent=`Found ${parsed.length} possible course(s). Please review the extracted fields carefully; this prototype parser may need corrections for your portal's exact text format.`;$("parsedCount").textContent=`${parsed.length} possible course(s) found`; $("saveParsed").disabled=false;$("parsedTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Course code</th><th>Course name</th><th>Class type</th><th>Slot code</th><th>Validation</th></tr></thead><tbody>${parsed.map((p,i)=>`<tr><td><input value="${escapeAttr(p.code)}" onchange="parsed[${i}].code=this.value" style="width:110px;background:#0b1220;color:white;border:1px solid #34415c;border-radius:6px;padding:6px"></td><td><input value="${escapeAttr(p.name)}" onchange="parsed[${i}].name=this.value" style="min-width:180px;width:100%;background:#0b1220;color:white;border:1px solid #34415c;border-radius:6px;padding:6px"></td><td><select onchange="parsed[${i}].kind=this.value" style="background:#0b1220;color:white;border:1px solid #34415c;border-radius:6px;padding:6px"><option ${p.kind==="Theory"?"selected":""}>Theory</option><option ${p.kind==="Lab"?"selected":""}>Lab</option><option ${p.kind==="Review"?"selected":""}>Review</option></select></td><td><input value="${escapeAttr(p.slot)}" onchange="parsed[${i}].slot=this.value" style="width:110px;background:#0b1220;color:white;border:1px solid #34415c;border-radius:6px;padding:6px"></td><td><span class="pill ${p.kind==="Review"||p.slot==="Review required"?"yellow":"green"}">${p.kind==="Review"||p.slot==="Review required"?"Check fields":"Ready to review"}</span></td></tr>`).join("")}</tbody></table></div>`}
function escapeAttr(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function saveParsedCourses(){if(!parsed.length)return;let count=0;parsed.forEach(p=>{if(!subjects.some(s=>s.code===p.code)){subjects.push({code:p.code,name:p.name,kind:p.kind==="Review"?"Theory":p.kind,attended:0,total:0,required:75});count++}});renderSubjects();persistData();toast(`${count} new course(s) added. Enter attendance counts and weekly days.`);showPage("subjects")}
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
function updateExamDate(){const e=publishedExams[Number($("examSelect").value)];if(e)$("examDate").value=e.date;refreshExamClassCount();}
$("examDate").addEventListener("change",refreshExamClassCount);
$("examSubject").addEventListener("change",refreshExamClassCount);
function isExcludedDate(dateStr){return calendarEvents.some(e=>e.date===dateStr&&["holiday","no-class"].includes(e.type));}
function countScheduledClasses(subject,examDate){
 if(!subject||!examDate)return 0;
 const end=new Date(examDate+"T00:00:00");let count=0;
 const cursor=new Date();cursor.setHours(0,0,0,0);
 const startISO=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-${String(cursor.getDate()).padStart(2,"0")}`;
 const start=new Date(startISO+"T00:00:00");
 if(end<=start)return 0;
 const days=Array.isArray(subject.weeklyDays)?subject.weeklyDays:[];
 for(let d=new Date(start);d<end;d.setDate(d.getDate()+1)){
   const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
   if(days.includes(d.getDay())&&!isExcludedDate(iso))count++;
 }
 return count;
}
function refreshExamClassCount(){const s=subjects[Number($("examSubject").value)];const date=$("examDate").value;const f=countScheduledClasses(s,date);$("examFuture").value=f;return f;}
function calculateExamPlan(){
 const s=subjects[Number($("examSubject").value)];if(!s)return;
 const f=refreshExamClassCount(),m=Number($("examMiss").value);
 if(!Number.isInteger(m)||m<0||m>f){toast(`Choose between 0 and ${f} absences. Check the subject's weekly mapping and exam date.`);return}
 const p=100*(s.attended+f-m)/(s.total+f);
 const min=s.required/100;
 const max=Math.max(0,Math.floor((s.attended+f)-min*(s.total+f)+1e-9));
 const el=$("examResult");el.classList.add("show");
 el.innerHTML=`<div class="muted" style="font-size:10px">PROJECTED AT EXAM DATE · ${escapeAttr(s.name)}</div><strong class="${p>=s.required?"good":"bad"}">${p.toFixed(2)}%</strong><p>BunkSafe counted <b>${f}</b> scheduled class session(s) before ${$("examDate").value}, based on your weekly mapping and excluded calendar dates.</p><p>Estimated maximum absences before the exam: <b>${max}</b>. Your selected plan misses ${m} class(es), leaving ${max-m} estimated absence(s) of margin.</p><p>${p>=s.required?"This estimate meets the selected threshold.":"This estimate falls below the selected threshold."} Verify special day orders and the official attendance record.</p>`;
}


function addCalendarEvent(){
 const date=$("eventDate").value,type=$("eventType").value,title=$("eventTitle").value.trim();
 if(!date||!title){toast("Enter the event date and title.");return}
 calendarEvents.push({date,type,title});calendarEvents.sort((a,b)=>a.date.localeCompare(b.date));
 $("eventDate").value="";$("eventTitle").value="";
 renderCalendarEvents();persistData();refreshExamClassCount();toast("Academic calendar event added.");
}
function renderCalendarEvents(){
 const el=$("calendarEventsList");if(!el)return;
 el.innerHTML=calendarEvents.length?calendarEvents.map((e,i)=>`<div class="subject"><div class="subject-top"><div><div class="subject-name">${escapeAttr(e.title)}</div><div class="subject-code">${e.date} · ${escapeAttr(e.type)}</div></div><button class="quiet" onclick="deleteCalendarEvent(${i})">Delete</button></div></div>`).join(""):'<div class="muted" style="font-size:12px">No events added.</div>';
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
makeCalendar("miniCalendar");makeCalendar("plannerCalendar");renderSubjects();renderExams();renderCalendarEvents();renderScheduleMapping();refreshExamClassCount();
