# 获取当前鼠标的位置（position)

```js
editor.selection.active
```

# 获取鼠标的offse

```js
editor.document.offsetAt(editor.selection.active)
```



# 根据字符的offset获取position

```js
let startPos = editor.document.positionAt(startIndex);
```


# Position比较

```js
if(cursorPosition.isBefore(endPos)&& cursorPosition.isAfter(startPos)){
    console.log('Cursor is in Cite Environment.: ', cursorPosition, startPos, endPos);
}
```

# offset比较

```js
if(cursorLoation >= startIndex && cursorLoation <= endIndex){
    return endIndex;
}
```



