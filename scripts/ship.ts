import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const git=(args:string[],inherit=false)=>execFileSync('git',args,{encoding:'utf8',stdio:inherit?'inherit':'pipe'});
const target=git(['remote','get-url','origin']).trim();
if(!/^https:\/\/github\.com\/vividhyeok\/vividparachute(?:\.git)?$/.test(target))throw new Error('의도한 vividparachute 저장소가 아닙니다.');
const branch=git(['branch','--show-current']).trim();if(branch!=='main')throw new Error('자동 배포는 main 브랜치에서만 실행합니다.');
git(['add','--','.']);
const staged=git(['diff','--cached','--name-only']).trim().split(/\r?\n/).filter(Boolean);
if(staged.some(f=>(/^\.env/.test(f)&&f!=='.env.example')||/^data\/(raw|processed|private)\//.test(f)||f==='overrides/content_corrections.json'||/^output\//.test(f)))throw new Error('개인 자료나 비밀 파일이 스테이징되어 있어 중단합니다.');
if(staged.length){git(['commit','-m',process.argv[2]||'Update vividparachute reading experience'],true);}
git(['-c','credential.helper=!gh auth git-credential','push','origin','HEAD:main'],true);
console.log('Pushed main. The linked Vercel project deploys this commit automatically.');
