# DeskLite

A collection of CLI inspired apps. Lightweight and minimal so you can keep focusing on what matters. Designed around a keyboard focused workflow.

Each app lives in its own folder so it is possible to open, copy, or deploy each one independently. All app logic is contained within their respective js, so file access is not blocked. Apps can be bookmarked and used without any manual or automated server startup scripts.

## Layout

| Tool | Path | Notes |
|------|------|--------|
| **tasks** | [`tasks/`](tasks/) | Task list. Open `tasks.html`; details in [`tasks/README.md`](tasks/README.md). |
| **timer** | [`timer/`](timer/) | Pomodoro / countdown timer. Open `timer.html`; details in [`timer/README.md`](timer/README.md). |
 
## Structure
 
```
desklite/
  index.html      ← launcher/entry point
  README.md
  tasks/
    tasks.html
    tasks.css
    tasks.js
    tasks.png
    README.md
  timer/
    timer.html
    timer.css
    timer.js
    README.md
```

## Design Philosophy

Modern productivity apps are filled to the brim with features, some better than others. Regardless, these features impact the usablity of the platform by cluttering the interface with unwanted noise. Not to mention the performance loss of cloud integration and what not.

### Why are there so many commands?

DeskLite attempts to balance features with simplicity by placing most of them behind commands. Users can use as few or as many features as they would like while keeping the UI dead simple. Most of the commands have some roots in Unix based operating systems like 'rm' and 'cd,' but I tried to keep it as intuitive as possible.

### Why do I have to keep track of my data?

By keeping everything local, DeskLite ensures everything runs extremely quickly, no waiting on APIs or cloud services. That being said, the user is now responsible for managing their data. This also means that no one else is collecting your data.

### Why are there 1000+ line js files?

One of the features I wanted for this app was the ability to bookmark it in a browser and open it. No servers, no startup scripts, nothing. To stop the browser from blocking opening the html from file://, no submodules could be made. 

While the argument could be made that a startup script could be automated to run a local server, I wanted to keep the start up process as simple as possible. Each app is also small / simplistic enough that the file size is not a huge burden.

### Why the CLI theme?

It is no secret that keyboards are an extremely fast way of interacting with machines, particularly for users who are very good at using them. I am by no means one of these users, but I found myself wishing for quick one line commands I could use in notepad to "create" a task or delete one.

Most productivity apps are built around the mouse. They may include keyboard support for shortcuts and whatnot, but I wanted to create something that was keyboard first, and mouse second. That is why the default focus element for all of the tools is the command line.

### Why is the font selection so limited? Why is it even there?

I believe that good design incorporates aesthetics and functionality together. All of the font options are fonts that could reasonably appear within a CLI. Fonts are chosen for CLI in the first place due to their readability and strong structure. At the same time, I also believe good design is personal, a well made coat is only as good as it fits you.