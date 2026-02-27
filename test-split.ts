const text = "Hi there!\n\nI am your AI companion.\nLet me know how I can help.";
console.log(text.split('\n').map(s => s.trim()).filter(s => s.length > 0));
