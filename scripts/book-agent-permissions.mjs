import {win32} from 'node:path';

const normalize=p=>win32.normalize(p.replaceAll('\\\\','\\')).replaceAll('\\','/').toLowerCase();
export function bookPathInside(path,cwd){
 const base=normalize(cwd),target=normalize(win32.resolve(cwd,path));
 return target===base||target.startsWith(base+'/');
}
export function commandPathsInside(command,cwd){
 const base=normalize(cwd);
 // A drive letter starts a path token. The final letter of "https:" or
 // "content:\\n" is ordinary text, not a filesystem path.
 for(const match of command.matchAll(/(?<![A-Za-z0-9_])[A-Za-z]:[\\/][^\n"';&|<>]*/g)){
  const path=normalize(match[0]);if(path!==base&&!path.startsWith(base+'/'))return false;
 }
 return true;
}
export function permitBookTool(params,cwd){
 const tool=params?.toolCall??{},input=tool.rawInput??tool.args??{};
 const name=String(tool.name??tool._meta?.toolName??tool.title??'');
 if(/sub.?agent|delegate|spawn|swarm|team|browser/i.test(name))return false;
 for(const key of ['path','Path','file_path','filePath','FilePath','absolute_path','AbsolutePath','TargetFile','DirectoryPath','SearchDirectory','SearchPath','SourcePath','DestinationPath','cwd','Cwd','workdir']){
  if(typeof input[key]==='string'&&!bookPathInside(input[key],cwd))return false;
 }
 const command=String(input.command??input.CommandLine??input.command_line??'');
 if(!command)return ['read','edit','search'].includes(tool.kind);
 if(!commandPathsInside(command,cwd))return false;
 // Keep tool execution within the book, without credential access or new agents.
 if(/(?:\.\.[\\/]|(?:\$env:|%)(?:APPDATA|LOCALAPPDATA|USERPROFILE)|\$HOME\b|\.codebuddy|\.workbuddy|\.gemini|\blibrary\.sqlite\b|\b(?:schtasks|taskkill|shutdown|Start-Process|Invoke-WebRequest)\b|\b(?:agy|codebuddy|claude|gemini)\.exe\b)/i.test(command))return false;
 if(/\b(?:Remove-Item|rmdir|rm|del)\b/i.test(command)){
  // Only one disposable test ZIP may be removed; never recurse or delete inputs.
  const m=command.match(/^\s*Remove-Item\s+-(?:LiteralPath|Path)\s+(["'])([^"']+)\1\s+-Force\s*$/i);
  if(!m||/[*?\[\]]/.test(m[2])||!bookPathInside(m[2],cwd))return false;
  const path=normalize(win32.resolve(cwd,m[2])),work=normalize(win32.join(cwd,'施工输出','工作'))+'/';
  return path.startsWith(work)&&/^result[^/]*\.zip$/i.test(path.slice(work.length));
 }
 return true;
}
