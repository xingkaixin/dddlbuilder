const language = navigator.language.toLowerCase();
const target = language.startsWith('zh') ? 'zh' : language.startsWith('ja') ? 'ja' : 'en';
const { search, hash } = window.location;

window.location.replace(`/docs/${target}/${search}${hash}`);
