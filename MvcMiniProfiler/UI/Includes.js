﻿var MiniProfiler = (function($) {

    var options,
        container;

    var hasLocalStorage = function() {
        try {
            return 'localStorage' in window && window['localStorage'] !== null;
        } catch (e) {
            return false;
        }
    };

    var getVersionedKey = function(keyPrefix) {
        return keyPrefix + '-' + options.version;
    }

    var save = function(keyPrefix, value) {
        if (!hasLocalStorage()) { return; }

        // clear old keys with this prefix, if any
        for (var i = 0; i < localStorage.length; i++) {
            if ((localStorage.key(i) || '').indexOf(keyPrefix) > -1) {
                localStorage.removeItem(localStorage.key(i));
            }
        }

        // save under this version
        localStorage[getVersionedKey(keyPrefix)] = value;
    };

    var load = function(keyPrefix) {
        if (!hasLocalStorage()) { return null; }

        return localStorage[getVersionedKey(keyPrefix)];
    };

    var fetchTemplates = function(success) {
        var key = 'mini-profiler-templates',
            cached = load(key);

        if (cached) {
            $('body').append(cached);
            success();
        }
        else {
            $.get(options.path + 'mini-profiler-includes.tmpl?v=' + options.version, function(data) {
                if (data) {
                    save(key, data);
                    $('body').append(data);
                    success();
                }
            });
        }
    };

    var fetchResults = function(id) {
        $.getJSON(options.path + 'mini-profiler-results?id=' + id + '&popup=1', function(json) {
            buttonShow(json);
        });
    };

    var renderTemplate = function(json) {
        return $('#profilerTemplate').tmpl(json);
    };

    var buttonShow = function(json) {
        var result = renderTemplate(json).appendTo(container),
            button = result.find('.profiler-button'),
            popup = result.find('.profiler-popup');

        // button will appear in corner with the total profiling duration - click to show details
        button.click(function() { buttonClick(button, popup); });

        // small duration steps and the column with aggregate durations are hidden by default; allow toggling
        toggleHidden(popup);

        // lightbox in the queries
        popup.find('.queries-show').click(function() { queriesShow($(this), result); });

        button.show();
    };

    var toggleHidden = function(popup) {
        var trivial = popup.find('.toggle-trivial');
        var childrenTime = popup.find('.toggle-duration-with-children');

        childrenTime.add(trivial).click(function() {
            var link = $(this),
                klass = link.attr('class').substr('toggle-'.length),
                isHidden = link.text().indexOf('show') > -1;

            popup.find('.' + klass).toggle(isHidden);
            link.text(link.text().replace(isHidden ? 'show' : 'hide', isHidden ? 'hide' : 'show'));

            popupPreventHorizontalScroll(popup);
        });

        // if option is set or all our timings are trivial, go ahead and show them
        if (options.showTrivial || trivial.data('show-on-load')) {
            trivial.click();
        }
        // if option is set, go ahead and show time with children
        if (options.showChildrenTime) {
            childrenTime.click();
        }
    };

    var buttonClick = function(button, popup) {
        // we're toggling this button/popup
        if (popup.is(':visible')) {
            popupHide(button, popup);
        }
        else {
            var visiblePopups = container.find('.profiler-popup:visible'),
                theirButtons = visiblePopups.siblings('.profiler-button');

            // hide any other popups
            popupHide(theirButtons, visiblePopups);

            // before showing the one we clicked
            popupShow(button, popup);
        }
    };

    var popupShow = function(button, popup) {
        button.addClass('profiler-button-active');

        popupSetDimensions(button, popup);

        popup.show();

        popupPreventHorizontalScroll(popup);
    };

    var popupSetDimensions = function(button, popup) {
        var top = button.position().top - 1, // position next to the button we clicked
            windowHeight = $(window).height(),
            maxHeight = windowHeight - top - 40; // make sure the popup doesn't extend below the fold

        popup
            .css({ 'top':top, 'max-height':maxHeight })
            .css(options.renderPosition, button.outerWidth() - 3); // move left or right, based on config
    };

    var popupPreventHorizontalScroll = function(popup) {
        var childrenHeight = 0;

        popup.children().each(function() { childrenHeight += $(this).height(); });

        popup.css({ 'padding-right':childrenHeight > popup.height() ? 40 : 10 });
    }

    var popupHide = function(button, popup) {
        button.removeClass('profiler-button-active');
        popup.hide();
    };

    var queriesShow = function(link, result) {

        var px = 30,
            win = $(window),
            width = win.width() - 2 * px,
            height = win.height() - 2 * px,
            queries = result.find('.profiler-queries');

        // opaque background
        $('<div class="profiler-queries-bg"/>').appendTo('body').css({ 'height': $(document).height() }).show();

        // center the queries and ensure long content is scrolled
        queries.css({ 'top':px, 'max-height':height, 'width':width }).css(options.renderPosition, px)
            .find('table').css({ 'width':width });

        // have to show everything before we can get a position for the first query
        queries.show();

        queriesScrollIntoView(link, queries, queries);

        // syntax highlighting
        prettyPrint();
    };

    var queriesScrollIntoView = function(link, queries, whatToScroll) {
        var id = link.closest('tr').attr('data-timing-id'),
            cells = queries.find('tr[data-timing-id="' + id + '"] td');

        // ensure they're in view
        whatToScroll.scrollTop(whatToScroll.scrollTop() + cells.first().position().top - 100);

        // highlight and then fade back to original bg color
        cells.each(function() {
            var td = $(this),
                originalColor = td.css('background-color');
            td.css('background-color', '#FFFFBB').animate({ backgroundColor:originalColor }, 2000);
        });
    };

    var bindDocumentEvents = function() {
        $(document).bind('click keyup', function(e) {

            var popup = $('.profiler-popup:visible');

            if (!popup.length) {
                return;
            }

            var button = popup.siblings('.profiler-button'),
                queries = popup.closest('.profiler-result').find('.profiler-queries'),
                bg = $('.profiler-queries-bg'),
                isEscPress = e.type == 'keyup' && e.which == 27,
                hidePopup = false,
                hideQueries = false;


            if (bg.is(':visible')) {
                hideQueries = isEscPress || !$.contains(queries[0], e.target) && !$.contains(popup[0], e.target);
            }
            else if (popup.is(':visible')) {
                hidePopup = isEscPress || (!$.contains(popup[0], e.target) && !$.contains(button[0], e.target) && button[0] != e.target);
            }

            if (hideQueries) {
                bg.remove();
                queries.hide();
            }

            if (hidePopup) {
                popupHide(button, popup);
            }
        });
    };

    var initFullView = function() {

        // first, get jquery tmpl, then render and bind handlers
        fetchTemplates(function() {

            // profiler will be defined in the full page's head
            renderTemplate(profiler).appendTo(container);

            var popup = $('.profiler-popup');

            toggleHidden(popup);

            prettyPrint();

            // since queries are already shown, just highlight and scroll when clicking a "1 sql" link
            popup.find('.queries-show').click(function() {
                queriesScrollIntoView($(this), $('.profiler-queries'), $(document));
            });
        });
    };

    var initPopupView = function() {
        // all fetched profilings will go in here
        container = $('<div class="profiler-results"/>').appendTo('body');

        // MiniProfiler.RenderIncludes() sets which corner to render in - default is upper left
        container.addClass(options.renderPosition);

        // we'll render results json via a jquery.tmpl - after we get the templates, we'll fetch the initial json to populate it
        fetchTemplates(function() {
            // get master page profiler results
            fetchResults(options.id);
        });

        // fetch profile results for any ajax calls
        $(document).ajaxComplete(function (e, xhr, settings) {
            if (xhr) {
                var id = xhr.getResponseHeader('X-MiniProfiler-Id');
                if (id) {
                    fetchResults(id);
                }
            }
        });

        // some elements want to be hidden on certain doc events
        bindDocumentEvents();
    };

    return {

        init: function(opt) {

            options = opt || { };

            // when rendering a shared, full page, this div will exist
            container = $('.profiler-result-full');

            if (container.length) {
                initFullView();
            }
            else {
                initPopupView();
            }
        },

        renderDate: function(jsonDate) { // JavaScriptSerializer sends dates as /Date(1308024322065)/
            if (jsonDate) {
                return new Date(parseInt(jsonDate.replace("/Date(", "").replace(")/",""), 10)).toUTCString();
            }
        },

        renderIndent: function(depth) {
            var result = '';
            for (var i = 0; i < depth; i++) {
                result += '&nbsp;';
            }
            return result;
        },

        renderExecuteType: function(typeId) {
            // see MvcMiniProfiler.ExecuteType enum
            switch (typeId) {
                case 0: return 'None';
                case 1: return 'NonQuery';
                case 2: return 'Scalar';
                case 3: return 'Reader';
            }
        },

        shareUrl: function(id) {
            return options.path + 'mini-profiler-results?id=' + id;
        },

        getSqlTimings: function(root) {
            var result = [],
                addToResults = function(timing) {
                    if (timing.SqlTimings) {
                        for (var i = 0, sqlTiming; i < timing.SqlTimings.length; i++) {
                            sqlTiming = timing.SqlTimings[i];

                            // HACK: add info about the parent Timing to each SqlTiming so UI can render
                            sqlTiming.TimingId = timing.Id;
                            sqlTiming.TimingName = timing.Name;

                            result.push(sqlTiming);
                        }
                    }

                    if (timing.Children) {
                        for (var i = 0; i < timing.Children.length; i++) {
                            addToResults(timing.Children[i]);
                        }
                    }
                };

            // start adding at the root and recurse down
            addToResults(root);

            // sort results by time
            result.sort(function(a, b) { return a.StartMilliseconds - b.StartMilliseconds; });

            return result;
        }
    };
})(jQuery);


//
// LESS - Leaner CSS v1.1.0
// http://lesscss.org
//
// Copyright (c) 2010, Alexis Sellier
// Licensed under the Apache 2.0 License.
//
(function(a,b){function v(a,b){var c="less-error-message:"+p(b),e=["<ul>",'<li><label>[-1]</label><pre class="ctx">{0}</pre></li>',"<li><label>[0]</label><pre>{current}</pre></li>",'<li><label>[1]</label><pre class="ctx">{2}</pre></li>',"</ul>"].join("\n"),f=document.createElement("div"),g,h;f.id=c,f.className="less-error-message",h="<h3>"+(a.message||"There is an error in your .less file")+"</h3>"+'<p><a href="'+b+'">'+b+"</a> ",a.extract&&(h+="on line "+a.line+", column "+(a.column+1)+":</p>"+e.replace(/\[(-?\d)\]/g,function(b,c){return parseInt(a.line)+parseInt(c)||""}).replace(/\{(\d)\}/g,function(b,c){return a.extract[parseInt(c)]||""}).replace(/\{current\}/,a.extract[1].slice(0,a.column)+'<span class="error">'+a.extract[1].slice(a.column)+"</span>")),f.innerHTML=h,q([".less-error-message ul, .less-error-message li {","list-style-type: none;","margin-right: 15px;","padding: 4px 0;","margin: 0;","}",".less-error-message label {","font-size: 12px;","margin-right: 15px;","padding: 4px 0;","color: #cc7777;","}",".less-error-message pre {","color: #ee4444;","padding: 4px 0;","margin: 0;","display: inline-block;","}",".less-error-message pre.ctx {","color: #dd4444;","}",".less-error-message h3 {","font-size: 20px;","font-weight: bold;","padding: 15px 0 5px 0;","margin: 0;","}",".less-error-message a {","color: #10a","}",".less-error-message .error {","color: red;","font-weight: bold;","padding-bottom: 2px;","border-bottom: 1px dashed red;","}"].join("\n"),{title:"error-message"}),f.style.cssText=["font-family: Arial, sans-serif","border: 1px solid #e00","background-color: #eee","border-radius: 5px","-webkit-border-radius: 5px","-moz-border-radius: 5px","color: #e00","padding: 15px","margin-bottom: 15px"].join(";"),d.env=="development"&&(g=setInterval(function(){document.body&&(document.getElementById(c)?document.body.replaceChild(f,document.getElementById(c)):document.body.insertBefore(f,document.body.firstChild),clearInterval(g))},10))}function u(a){d.env=="development"&&typeof console!="undefined"&&console.log("less: "+a)}function t(a){return a&&a.parentNode.removeChild(a)}function s(){if(a.XMLHttpRequest)return new XMLHttpRequest;try{return new ActiveXObject("MSXML2.XMLHTTP.3.0")}catch(b){u("browser doesn't support AJAX.");return null}}function r(a,b,c,e){function i(b,c,d){b.status>=200&&b.status<300?c(b.responseText,b.getResponseHeader("Last-Modified")):typeof d=="function"&&d(b.status,a)}var f=s(),h=g?!1:d.async;typeof f.overrideMimeType=="function"&&f.overrideMimeType("text/css"),f.open("GET",a,h),f.setRequestHeader("Accept",b||"text/x-less, text/css; q=0.9, */*; q=0.5"),f.send(null),g?f.status===0?c(f.responseText):e(f.status,a):h?f.onreadystatechange=function(){f.readyState==4&&i(f,c,e)}:i(f,c,e)}function q(a,b,c){var d,e=b.href?b.href.replace(/\?.*$/,""):"",f="less:"+(b.title||p(e));(d=document.getElementById(f))===null&&(d=document.createElement("style"),d.type="text/css",d.media=b.media||"screen",d.id=f,document.getElementsByTagName("head")[0].appendChild(d));if(d.styleSheet)try{d.styleSheet.cssText=a}catch(g){throw new Error("Couldn't reassign styleSheet.cssText.")}else(function(a){d.childNodes.length>0?d.firstChild.nodeValue!==a.nodeValue&&d.replaceChild(a,d.firstChild):d.appendChild(a)})(document.createTextNode(a));c&&h&&(u("saving "+e+" to cache."),h.setItem(e,a),h.setItem(e+":timestamp",c))}function p(a){return a.replace(/^[a-z]+:\/\/?[^\/]+/,"").replace(/^\//,"").replace(/\?.*$/,"").replace(/\.[^\.\/]+$/,"").replace(/[^\.\w-]+/g,"-").replace(/\./g,":")}function o(b,c,e,f){var g=a.location.href.replace(/[#?].*$/,""),i=b.href.replace(/\?.*$/,""),j=h&&h.getItem(i),k=h&&h.getItem(i+":timestamp"),l={css:j,timestamp:k};/^(https?|file):/.test(i)||(i=g.slice(0,g.lastIndexOf("/")+1)+i),r(b.href,b.type,function(a,g){if(!e&&l&&g&&(new Date(g)).valueOf()===(new Date(l.timestamp)).valueOf())q(l.css,b),c(null,b,{local:!0,remaining:f});else try{(new d.Parser({optimization:d.optimization,paths:[i.replace(/[\w\.-]+$/,"")],mime:b.type})).parse(a,function(a,d){if(a)return v(a,i);try{c(d,b,{local:!1,lastModified:g,remaining:f}),t(document.getElementById("less-error-message:"+p(i)))}catch(a){v(a,i)}})}catch(h){v(h,i)}},function(a,b){throw new Error("Couldn't load "+b+" ("+a+")")})}function n(a,b){for(var c=0;c<d.sheets.length;c++)o(d.sheets[c],a,b,d.sheets.length-(c+1))}function m(){var a=document.getElementsByTagName("style");for(var b=0;b<a.length;b++)a[b].type.match(k)&&(new d.Parser).parse(a[b].innerHTML||"",function(c,d){a[b].type="text/css",a[b].innerHTML=d.toCSS()})}function c(b){return a.less[b.split("/")[1]]}Array.isArray||(Array.isArray=function(a){return Object.prototype.toString.call(a)==="[object Array]"||a instanceof Array}),Array.prototype.forEach||(Array.prototype.forEach=function(a,b){var c=this.length>>>0;for(var d=0;d<c;d++)d in this&&a.call(b,this[d],d,this)}),Array.prototype.map||(Array.prototype.map=function(a){var b=this.length>>>0,c=Array(b),d=arguments[1];for(var e=0;e<b;e++)e in this&&(c[e]=a.call(d,this[e],e,this));return c}),Array.prototype.filter||(Array.prototype.filter=function(a){var b=[],c=arguments[1];for(var d=0;d<this.length;d++)a.call(c,this[d])&&b.push(this[d]);return b}),Array.prototype.reduce||(Array.prototype.reduce=function(a){var b=this.length>>>0,c=0;if(b===0&&arguments.length===1)throw new TypeError;if(arguments.length>=2)var d=arguments[1];else for(;;){if(c in this){d=this[c++];break}if(++c>=b)throw new TypeError}for(;c<b;c++)c in this&&(d=a.call(null,d,this[c],c,this));return d}),Array.prototype.indexOf||(Array.prototype.indexOf=function(a){var b=this.length,c=arguments[1]||0;if(!b)return-1;if(c>=b)return-1;c<0&&(c+=b);for(;c<b;c++){if(!Object.prototype.hasOwnProperty.call(this,c))continue;if(a===this[c])return c}return-1}),Object.keys||(Object.keys=function(a){var b=[];for(var c in a)Object.prototype.hasOwnProperty.call(a,c)&&b.push(c);return b}),String.prototype.trim||(String.prototype.trim=function(){return String(this).replace(/^\s\s*/,"").replace(/\s\s*$/,"")});var d,e;typeof a=="undefined"?(d=exports,e=c("less/tree")):(typeof a.less=="undefined"&&(a.less={}),d=a.less,e=a.less.tree={}),d.Parser=function(a){function t(a){return typeof a=="string"?b.charAt(c)===a:a.test(j[f])?!0:!1}function s(a){var d,e,g,h,i,m,n,o;if(a instanceof Function)return a.call(l.parsers);if(typeof a=="string")d=b.charAt(c)===a?a:null,g=1,r();else{r();if(d=a.exec(j[f]))g=d[0].length;else return null}if(d){o=c+=g,m=c+j[f].length-g;while(c<m){h=b.charCodeAt(c);if(h!==32&&h!==10&&h!==9)break;c++}j[f]=j[f].slice(g+(c-o)),k=c,j[f].length===0&&f<j.length-1&&f++;return typeof d=="string"?d:d.length===1?d[0]:d}}function r(){c>k&&(j[f]=j[f].slice(c-k),k=c)}function q(){j[f]=g,c=h,k=c}function p(){g=j[f],h=c,k=c}var b,c,f,g,h,i,j,k,l,m=this,n=function(){},o=this.imports={paths:a&&a.paths||[],queue:[],files:{},mime:a&&a.mime,push:function(b,c){var e=this;this.queue.push(b),d.Parser.importer(b,this.paths,function(a){e.queue.splice(e.queue.indexOf(b),1),e.files[b]=a,c(a),e.queue.length===0&&n()},a)}};this.env=a=a||{},this.optimization="optimization"in this.env?this.env.optimization:1,this.env.filename=this.env.filename||null;return l={imports:o,parse:function(d,g){var h,l,m,o,p,q,r=[],t,u=null;c=f=k=i=0,j=[],b=d.replace(/\r\n/g,"\n"),j=function(c){var d=0,e=/[^"'`\{\}\/\(\)]+/g,f=/\/\*(?:[^*]|\*+[^\/*])*\*+\/|\/\/.*/g,g=0,h,i=c[0],j,k;for(var l=0,m,n;l<b.length;l++){e.lastIndex=l,(h=e.exec(b))&&h.index===l&&(l+=h[0].length,i.push(h[0])),m=b.charAt(l),f.lastIndex=l,!k&&!j&&m==="/"&&(n=b.charAt(l+1),(n==="/"||n==="*")&&(h=f.exec(b))&&h.index===l&&(l+=h[0].length,i.push(h[0]),m=b.charAt(l)));if(m==="{"&&!k&&!j)g++,i.push(m);else if(m==="}"&&!k&&!j)g--,i.push(m),c[++d]=i=[];else if(m==="("&&!k&&!j)i.push(m),j=!0;else if(m===")"&&!k&&j)i.push(m),j=!1;else{if(m==='"'||m==="'"||m==="`")k?k=k===m?!1:k:k=m;i.push(m)}}if(g>0)throw{type:"Syntax",message:"Missing closing `}`",filename:a.filename};return c.map(function(a){return a.join("")})}([[]]),h=new e.Ruleset([],s(this.parsers.primary)),h.root=!0,h.toCSS=function(c){var d,f,g;return function(g,h){function n(a){return a?(b.slice(0,a).match(/\n/g)||"").length:null}var i=[];g=g||{},typeof h=="object"&&!Array.isArray(h)&&(h=Object.keys(h).map(function(a){var b=h[a];b instanceof e.Value||(b instanceof e.Expression||(b=new e.Expression([b])),b=new e.Value([b]));return new e.Rule("@"+a,b,!1,0)}),i=[new e.Ruleset(null,h)]);try{var j=c.call(this,{frames:i}).toCSS([],{compress:g.compress||!1})}catch(k){f=b.split("\n"),d=n(k.index);for(var l=k.index,m=-1;l>=0&&b.charAt(l)!=="\n";l--)m++;throw{type:k.type,message:k.message,filename:a.filename,index:k.index,line:typeof d=="number"?d+1:null,callLine:k.call&&n(k.call)+1,callExtract:f[n(k.call)],stack:k.stack,column:m,extract:[f[d-1],f[d],f[d+1]]}}return g.compress?j.replace(/(\s)+/g,"$1"):j}}(h.eval);if(c<b.length-1){c=i,q=b.split("\n"),p=(b.slice(0,c).match(/\n/g)||"").length+1;for(var v=c,w=-1;v>=0&&b.charAt(v)!=="\n";v--)w++;u={name:"ParseError",message:"Syntax Error on line "+p,index:c,filename:a.filename,line:p,column:w,extract:[q[p-2],q[p-1],q[p]]}}this.imports.queue.length>0?n=function(){g(u,h)}:g(u,h)},parsers:{primary:function(){var a,b=[];while((a=s(this.mixin.definition)||s(this.rule)||s(this.ruleset)||s(this.mixin.call)||s(this.comment)||s(this.directive))||s(/^[\s\n]+/))a&&b.push(a);return b},comment:function(){var a;if(b.charAt(c)==="/"){if(b.charAt(c+1)==="/")return new e.Comment(s(/^\/\/.*/),!0);if(a=s(/^\/\*(?:[^*]|\*+[^\/*])*\*+\/\n?/))return new e.Comment(a)}},entities:{quoted:function(){var a,d=c,f;b.charAt(d)==="~"&&(d++,f=!0);if(b.charAt(d)==='"'||b.charAt(d)==="'"){f&&s("~");if(a=s(/^"((?:[^"\\\r\n]|\\.)*)"|'((?:[^'\\\r\n]|\\.)*)'/))return new e.Quoted(a[0],a[1]||a[2],f)}},keyword:function(){var a;if(a=s(/^[A-Za-z-]+/))return new e.Keyword(a)},call:function(){var a,b;if(!!(a=/^([\w-]+|%)\(/.exec(j[f]))){a=a[1].toLowerCase();if(a==="url")return null;c+=a.length;if(a==="alpha")return s(this.alpha);s("("),b=s(this.entities.arguments);if(!s(")"))return;if(a)return new e.Call(a,b)}},arguments:function(){var a=[],b;while(b=s(this.expression)){a.push(b);if(!s(","))break}return a},literal:function(){return s(this.entities.dimension)||s(this.entities.color)||s(this.entities.quoted)},url:function(){var a;if(b.charAt(c)==="u"&&!!s(/^url\(/)){a=s(this.entities.quoted)||s(this.entities.variable)||s(this.entities.dataURI)||s(/^[-\w%@$\/.&=:;#+?~]+/)||"";if(!s(")"))throw new Error("missing closing ) for url()");return new e.URL(a.value||a.data||a instanceof e.Variable?a:new e.Anonymous(a),o.paths)}},dataURI:function(){var a;if(s(/^data:/)){a={},a.mime=s(/^[^\/]+\/[^,;)]+/)||"",a.charset=s(/^;\s*charset=[^,;)]+/)||"",a.base64=s(/^;\s*base64/)||"",a.data=s(/^,\s*[^)]+/);if(a.data)return a}},variable:function(){var a,d=c;if(b.charAt(c)==="@"&&(a=s(/^@@?[\w-]+/)))return new e.Variable(a,d)},color:function(){var a;if(b.charAt(c)==="#"&&(a=s(/^#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/)))return new e.Color(a[1])},dimension:function(){var a,d=b.charCodeAt(c);if(!(d>57||d<45||d===47))if(a=s(/^(-?\d*\.?\d+)(px|%|em|pc|ex|in|deg|s|ms|pt|cm|mm|rad|grad|turn)?/))return new e.Dimension(a[1],a[2])},javascript:function(){var a,d=c,f;b.charAt(d)==="~"&&(d++,f=!0);if(b.charAt(d)==="`"){f&&s("~");if(a=s(/^`([^`]*)`/))return new e.JavaScript(a[1],c,f)}}},variable:function(){var a;if(b.charAt(c)==="@"&&(a=s(/^(@[\w-]+)\s*:/)))return a[1]},shorthand:function(){var a,b;if(!!t(/^[@\w.%-]+\/[@\w.-]+/)&&(a=s(this.entity))&&s("/")&&(b=s(this.entity)))return new e.Shorthand(a,b)},mixin:{call:function(){var a=[],d,f,g,h=c,i=b.charAt(c);if(i==="."||i==="#"){while(d=s(/^[#.](?:[\w-]|\\(?:[a-fA-F0-9]{1,6} ?|[^a-fA-F0-9]))+/))a.push(new e.Element(f,d)),f=s(">");s("(")&&(g=s(this.entities.arguments))&&s(")");if(a.length>0&&(s(";")||t("}")))return new e.mixin.Call(a,g,h)}},definition:function(){var a,d=[],f,g,h,i;if(!(b.charAt(c)!=="."&&b.charAt(c)!=="#"||t(/^[^{]*(;|})/)))if(f=s(/^([#.](?:[\w-]|\\(?:[a-fA-F0-9]{1,6} ?|[^a-fA-F0-9]))+)\s*\(/)){a=f[1];while(h=s(this.entities.variable)||s(this.entities.literal)||s(this.entities.keyword)){if(h instanceof e.Variable)if(s(":"))if(i=s(this.expression))d.push({name:h.name,value:i});else throw new Error("Expected value");else d.push({name:h.name});else d.push({value:h});if(!s(","))break}if(!s(")"))throw new Error("Expected )");g=s(this.block);if(g)return new e.mixin.Definition(a,d,g)}}},entity:function(){return s(this.entities.literal)||s(this.entities.variable)||s(this.entities.url)||s(this.entities.call)||s(this.entities.keyword)||s(this.entities.javascript)||s(this.comment)},end:function(){return s(";")||t("}")},alpha:function(){var a;if(!!s(/^opacity=/i))if(a=s(/^\d+/)||s(this.entities.variable)){if(!s(")"))throw new Error("missing closing ) for alpha()");return new e.Alpha(a)}},element:function(){var a,b,c;c=s(this.combinator),a=s(/^(?:[.#]?|:*)(?:[\w-]|\\(?:[a-fA-F0-9]{1,6} ?|[^a-fA-F0-9]))+/)||s("*")||s(this.attribute)||s(/^\([^)@]+\)/);if(a)return new e.Element(c,a)},combinator:function(){var a,d=b.charAt(c);if(d===">"||d==="&"||d==="+"||d==="~"){c++;while(b.charAt(c)===" ")c++;return new e.Combinator(d)}if(d===":"&&b.charAt(c+1)===":"){c+=2;while(b.charAt(c)===" ")c++;return new e.Combinator("::")}return b.charAt(c-1)===" "?new e.Combinator(" "):new e.Combinator(null)},selector:function(){var a,d,f=[],g,h;while(d=s(this.element)){g=b.charAt(c),f.push(d);if(g==="{"||g==="}"||g===";"||g===",")break}if(f.length>0)return new e.Selector(f)},tag:function(){return s(/^[a-zA-Z][a-zA-Z-]*[0-9]?/)||s("*")},attribute:function(){var a="",b,c,d;if(!!s("[")){if(b=s(/^[a-zA-Z-]+/)||s(this.entities.quoted))(d=s(/^[|~*$^]?=/))&&(c=s(this.entities.quoted)||s(/^[\w-]+/))?a=[b,d,c.toCSS?c.toCSS():c].join(""):a=b;if(!s("]"))return;if(a)return"["+a+"]"}},block:function(){var a;if(s("{")&&(a=s(this.primary))&&s("}"))return a},ruleset:function(){var a=[],b,d,g;p();if(g=/^([.#: \w-]+)[\s\n]*\{/.exec(j[f]))c+=g[0].length-1,a=[new e.Selector([new e.Element(null,g[1])])];else while(b=s(this.selector)){a.push(b),s(this.comment);if(!s(","))break;s(this.comment)}if(a.length>0&&(d=s(this.block)))return new e.Ruleset(a,d);i=c,q()},rule:function(){var a,d,g=b.charAt(c),k,l;p();if(g!=="."&&g!=="#"&&g!=="&")if(a=s(this.variable)||s(this.property)){a.charAt(0)!="@"&&(l=/^([^@+\/'"*`(;{}-]*);/.exec(j[f]))?(c+=l[0].length-1,d=new e.Anonymous(l[1])):a==="font"?d=s(this.font):d=s(this.value),k=s(this.important);if(d&&s(this.end))return new e.Rule(a,d,k,h);i=c,q()}},"import":function(){var a;if(s(/^@import\s+/)&&(a=s(this.entities.quoted)||s(this.entities.url))&&s(";"))return new e.Import(a,o)},directive:function(){var a,d,f,g;if(b.charAt(c)==="@"){if(d=s(this["import"]))return d;if(a=s(/^@media|@page|@-[-a-z]+/)){g=(s(/^[^{]+/)||"").trim();if(f=s(this.block))return new e.Directive(a+" "+g,f)}else if(a=s(/^@[-a-z]+/))if(a==="@font-face"){if(f=s(this.block))return new e.Directive(a,f)}else if((d=s(this.entity))&&s(";"))return new e.Directive(a,d)}},font:function(){var a=[],b=[],c,d,f,g;while(g=s(this.shorthand)||s(this.entity))b.push(g);a.push(new e.Expression(b));if(s(","))while(g=s(this.expression)){a.push(g);if(!s(","))break}return new e.Value(a)},value:function(){var a,b=[],c;while(a=s(this.expression)){b.push(a);if(!s(","))break}if(b.length>0)return new e.Value(b)},important:function(){if(b.charAt(c)==="!")return s(/^! *important/)},sub:function(){var a;if(s("(")&&(a=s(this.expression))&&s(")"))return a},multiplication:function(){var a,b,c,d;if(a=s(this.operand)){while((c=s("/")||s("*"))&&(b=s(this.operand)))d=new e.Operation(c,[d||a,b]);return d||a}},addition:function(){var a,d,f,g;if(a=s(this.multiplication)){while((f=s(/^[-+]\s+/)||b.charAt(c-1)!=" "&&(s("+")||s("-")))&&(d=s(this.multiplication)))g=new e.Operation(f,[g||a,d]);return g||a}},operand:function(){var a,d=b.charAt(c+1);b.charAt(c)==="-"&&(d==="@"||d==="(")&&(a=s("-"));var f=s(this.sub)||s(this.entities.dimension)||s(this.entities.color)||s(this.entities.variable)||s(this.entities.call);return a?new e.Operation("*",[new e.Dimension(-1),f]):f},expression:function(){var a,b,c=[],d;while(a=s(this.addition)||s(this.entity))c.push(a);if(c.length>0)return new e.Expression(c)},property:function(){var a;if(a=s(/^(\*?-?[-a-z_0-9]+)\s*:/))return a[1]}}}},typeof a!="undefined"&&(d.Parser.importer=function(a,b,c,d){a.charAt(0)!=="/"&&b.length>0&&(a=b[0]+a),o({href:a,title:a,type:d.mime},c,!0)}),function(a){function d(a){return Math.min(1,Math.max(0,a))}function c(b){if(b instanceof a.Dimension)return parseFloat(b.unit=="%"?b.value/100:b.value);if(typeof b=="number")return b;throw{error:"RuntimeError",message:"color functions take numbers as parameters"}}function b(b){return a.functions.hsla(b.h,b.s,b.l,b.a)}a.functions={rgb:function(a,b,c){return this.rgba(a,b,c,1)},rgba:function(b,d,e,f){var g=[b,d,e].map(function(a){return c(a)}),f=c(f);return new a.Color(g,f)},hsl:function(a,b,c){return this.hsla(a,b,c,1)},hsla:function(a,b,d,e){function h(a){a=a<0?a+1:a>1?a-1:a;return a*6<1?g+(f-g)*a*6:a*2<1?f:a*3<2?g+(f-g)*(2/3-a)*6:g}a=c(a)%360/360,b=c(b),d=c(d),e=c(e);var f=d<=.5?d*(b+1):d+b-d*b,g=d*2-f;return this.rgba(h(a+1/3)*255,h(a)*255,h(a-1/3)*255,e)},hue:function(b){return new a.Dimension(Math.round(b.toHSL().h))},saturation:function(b){return new a.Dimension(Math.round(b.toHSL().s*100),"%")},lightness:function(b){return new a.Dimension(Math.round(b.toHSL().l*100),"%")},alpha:function(b){return new a.Dimension(b.toHSL().a)},saturate:function(a,c){var e=a.toHSL();e.s+=c.value/100,e.s=d(e.s);return b(e)},desaturate:function(a,c){var e=a.toHSL();e.s-=c.value/100,e.s=d(e.s);return b(e)},lighten:function(a,c){var e=a.toHSL();e.l+=c.value/100,e.l=d(e.l);return b(e)},darken:function(a,c){var e=a.toHSL();e.l-=c.value/100,e.l=d(e.l);return b(e)},fadein:function(a,c){var e=a.toHSL();e.a+=c.value/100,e.a=d(e.a);return b(e)},fadeout:function(a,c){var e=a.toHSL();e.a-=c.value/100,e.a=d(e.a);return b(e)},spin:function(a,c){var d=a.toHSL(),e=(d.h+c.value)%360;d.h=e<0?360+e:e;return b(d)},mix:function(b,c,d){var e=d.value/100,f=e*2-1,g=b.toHSL().a-c.toHSL().a,h=((f*g==-1?f:(f+g)/(1+f*g))+1)/2,i=1-h,j=[b.rgb[0]*h+c.rgb[0]*i,b.rgb[1]*h+c.rgb[1]*i,b.rgb[2]*h+c.rgb[2]*i],k=b.alpha*e+c.alpha*(1-e);return new a.Color(j,k)},greyscale:function(b){return this.desaturate(b,new a.Dimension(100))},e:function(b){return new a.Anonymous(b instanceof a.JavaScript?b.evaluated:b)},escape:function(b){return new a.Anonymous(encodeURI(b.value).replace(/=/g,"%3D").replace(/:/g,"%3A").replace(/#/g,"%23").replace(/;/g,"%3B").replace(/\(/g,"%28").replace(/\)/g,"%29"))},"%":function(b){var c=Array.prototype.slice.call(arguments,1),d=b.value;for(var e=0;e<c.length;e++)d=d.replace(/%[sda]/i,function(a){var b=a.match(/s/i)?c[e].value:c[e].toCSS();return a.match(/[A-Z]$/)?encodeURIComponent(b):b});d=d.replace(/%%/g,"%");return new a.Quoted('"'+d+'"',d)},round:function(b){if(b instanceof a.Dimension)return new a.Dimension(Math.round(c(b)),b.unit);if(typeof b=="number")return Math.round(b);throw{error:"RuntimeError",message:"math functions take numbers as parameters"}}}}(c("less/tree")),function(a){a.Alpha=function(a){this.value=a},a.Alpha.prototype={toCSS:function(){return"alpha(opacity="+(this.value.toCSS?this.value.toCSS():this.value)+")"},eval:function(){return this}}}(c("less/tree")),function(a){a.Anonymous=function(a){this.value=a.value||a},a.Anonymous.prototype={toCSS:function(){return this.value},eval:function(){return this}}}(c("less/tree")),function(a){a.Call=function(a,b){this.name=a,this.args=b},a.Call.prototype={eval:function(b){var c=this.args.map(function(a){return a.eval(b)});return this.name in a.functions?a.functions[this.name].apply(a.functions,c):new a.Anonymous(this.name+"("+c.map(function(a){return a.toCSS()}).join(", ")+")")},toCSS:function(a){return this.eval(a).toCSS()}}}(c("less/tree")),function(a){a.Color=function(a,b){Array.isArray(a)?this.rgb=a:a.length==6?this.rgb=a.match(/.{2}/g).map(function(a){return parseInt(a,16)}):a.length==8?(this.alpha=parseInt(a.substring(0,2),16)/255,this.rgb=a.substr(2).match(/.{2}/g).map(function(a){return parseInt(a,16)})):this.rgb=a.split("").map(function(a){return parseInt(a+a,16)}),this.alpha=typeof b=="number"?b:1},a.Color.prototype={eval:function(){return this},toCSS:function(){return this.alpha<1?"rgba("+this.rgb.map(function(a){return Math.round(a)}).concat(this.alpha).join(", ")+")":"#"+this.rgb.map(function(a){a=Math.round(a),a=(a>255?255:a<0?0:a).toString(16);return a.length===1?"0"+a:a}).join("")},operate:function(b,c){var d=[];c instanceof a.Color||(c=c.toColor());for(var e=0;e<3;e++)d[e]=a.operate(b,this.rgb[e],c.rgb[e]);return new a.Color(d,this.alpha+c.alpha)},toHSL:function(){var a=this.rgb[0]/255,b=this.rgb[1]/255,c=this.rgb[2]/255,d=this.alpha,e=Math.max(a,b,c),f=Math.min(a,b,c),g,h,i=(e+f)/2,j=e-f;if(e===f)g=h=0;else{h=i>.5?j/(2-e-f):j/(e+f);switch(e){case a:g=(b-c)/j+(b<c?6:0);break;case b:g=(c-a)/j+2;break;case c:g=(a-b)/j+4}g/=6}return{h:g*360,s:h,l:i,a:d}}}}(c("less/tree")),function(a){a.Comment=function(a,b){this.value=a,this.silent=!!b},a.Comment.prototype={toCSS:function(a){return a.compress?"":this.value},eval:function(){return this}}}(c("less/tree")),function(a){a.Dimension=function(a,b){this.value=parseFloat(a),this.unit=b||null},a.Dimension.prototype={eval:function(){return this},toColor:function(){return new a.Color([this.value,this.value,this.value])},toCSS:function(){var a=this.value+this.unit;return a},operate:function(b,c){return new a.Dimension(a.operate(b,this.value,c.value),this.unit||c.unit)}}}(c("less/tree")),function(a){a.Directive=function(b,c){this.name=b,Array.isArray(c)?this.ruleset=new a.Ruleset([],c):this.value=c},a.Directive.prototype={toCSS:function(a,b){if(this.ruleset){this.ruleset.root=!0;return this.name+(b.compress?"{":" {\n  ")+this.ruleset.toCSS(a,b).trim().replace(/\n/g,"\n  ")+(b.compress?"}":"\n}\n")}return this.name+" "+this.value.toCSS()+";\n"},eval:function(a){a.frames.unshift(this),this.ruleset=this.ruleset&&this.ruleset.eval(a),a.frames.shift();return this},variable:function(b){return a.Ruleset.prototype.variable.call(this.ruleset,b)},find:function(){return a.Ruleset.prototype.find.apply(this.ruleset,arguments)},rulesets:function(){return a.Ruleset.prototype.rulesets.apply(this.ruleset)}}}(c("less/tree")),function(a){a.Element=function(b,c){this.combinator=b instanceof a.Combinator?b:new a.Combinator(b),this.value=c.trim()},a.Element.prototype.toCSS=function(a){return this.combinator.toCSS(a||{})+this.value},a.Combinator=function(a){a===" "?this.value=" ":this.value=a?a.trim():""},a.Combinator.prototype.toCSS=function(a){return{"":""," ":" ","&":"",":":" :","::":"::","+":a.compress?"+":" + ","~":a.compress?"~":" ~ ",">":a.compress?">":" > "}[this.value]}}(c("less/tree")),function(a){a.Expression=function(a){this.value=a},a.Expression.prototype={eval:function(b){return this.value.length>1?new a.Expression(this.value.map(function(a){return a.eval(b)})):this.value[0].eval(b)},toCSS:function(a){return this.value.map(function(b){return b.toCSS(a)}).join(" ")}}}(c("less/tree")),function(a){a.Import=function(b,c){var d=this;this._path=b,b instanceof a.Quoted?this.path=/\.(le?|c)ss$/.test(b.value)?b.value:b.value+".less":this.path=b.value.value||b.value,this.css=/css$/.test(this.path),this.css||c.push(this.path,function(a){if(!a)throw new Error("Error parsing "+d.path);d.root=a})},a.Import.prototype={toCSS:function(){return this.css?"@import "+this._path.toCSS()+";\n":""},eval:function(b){var c;if(this.css)return this;c=new a.Ruleset(null,this.root.rules.slice(0));for(var d=0;d<c.rules.length;d++)c.rules[d]instanceof a.Import&&Array.prototype.splice.apply(c.rules,[d,1].concat(c.rules[d].eval(b)));return c.rules}}}(c("less/tree")),function(a){a.JavaScript=function(a,b,c){this.escaped=c,this.expression=a,this.index=b},a.JavaScript.prototype={toCSS:function(){return this.escaped?this.evaluated:JSON.stringify(this.evaluated)},eval:function(b){var c,d={},e=this.expression.replace(/@\{([\w-]+)\}/g,function(c,d){return(new a.Variable("@"+d)).eval(b).value});e=new Function("return ("+e+")");for(var f in b.frames[0].variables())d[f.slice(1)]={value:b.frames[0].variables()[f].value,toJS:function(){return this.value.eval(b).toCSS()}};try{this.evaluated=e.call(d)}catch(g){throw{message:"JavaScript evaluation error: '"+g.name+": "+g.message+"'",index:this.index}}return this}}}(c("less/tree")),function(a){a.Keyword=function(a){this.value=a},a.Keyword.prototype={eval:function(){return this},toCSS:function(){return this.value}}}(c("less/tree")),function(a){a.mixin={},a.mixin.Call=function(b,c,d){this.selector=new a.Selector(b),this.arguments=c,this.index=d},a.mixin.Call.prototype={eval:function(a){var b,c=[],d=!1;for(var e=0;e<a.frames.length;e++)if((b=a.frames[e].find(this.selector)).length>0){for(var f=0;f<b.length;f++)if(b[f].match(this.arguments,a))try{Array.prototype.push.apply(c,b[f].eval(a,this.arguments).rules),d=!0}catch(g){throw{message:g.message,index:g.index,stack:g.stack,call:this.index}}if(d)return c;throw{message:"No matching definition was found for `"+this.selector.toCSS().trim()+"("+this.arguments.map(function(a){return a.toCSS()}).join(", ")+")`",index:this.index}}throw{message:this.selector.toCSS().trim()+" is undefined",index:this.index}}},a.mixin.Definition=function(b,c,d){this.name=b,this.selectors=[new a.Selector([new a.Element(null,b)])],this.params=c,this.arity=c.length,this.rules=d,this._lookups={},this.required=c.reduce(function(a,b){return!b.name||b.name&&!b.value?a+1:a},0),this.parent=a.Ruleset.prototype,this.frames=[]},a.mixin.Definition.prototype={toCSS:function(){return""},variable:function(a){return this.parent.variable.call(this,a)},variables:function(){return this.parent.variables.call(this)},find:function(){return this.parent.find.apply(this,arguments)},rulesets:function(){return this.parent.rulesets.apply(this)},eval:function(b,c){var d=new a.Ruleset(null,[]),e,f=[];for(var g=0,h;g<this.params.length;g++)if(this.params[g].name)if(h=c&&c[g]||this.params[g].value)d.rules.unshift(new a.Rule(this.params[g].name,h.eval(b)));else throw{message:"wrong number of arguments for "+this.name+" ("+c.length+" for "+this.arity+")"};for(var g=0;g<Math.max(this.params.length,c&&c.length);g++)f.push(c[g]||this.params[g].value);d.rules.unshift(new a.Rule("@arguments",new a.Expression(f)));return(new a.Ruleset(null,this.rules.slice(0))).eval({frames:[this,d].concat(this.frames,b.frames)})},match:function(a,b){var c=a&&a.length||0,d;if(c<this.required)return!1;if(this.required>0&&c>this.params.length)return!1;d=Math.min(c,this.arity);for(var e=0;e<d;e++)if(!this.params[e].name&&a[e].eval(b).toCSS()!=this.params[e].value.eval(b).toCSS())return!1;return!0}}}(c("less/tree")),function(a){a.Operation=function(a,b){this.op=a.trim(),this.operands=b},a.Operation.prototype.eval=function(b){var c=this.operands[0].eval(b),d=this.operands[1].eval(b),e;if(c instanceof a.Dimension&&d instanceof a.Color)if(this.op==="*"||this.op==="+")e=d,d=c,c=e;else throw{name:"OperationError",message:"Can't substract or divide a color from a number"};return c.operate(this.op,d)},a.operate=function(a,b,c){switch(a){case"+":return b+c;case"-":return b-c;case"*":return b*c;case"/":return b/c}}}(c("less/tree")),function(a){a.Quoted=function(a,b,c,d){this.escaped=c,this.value=b||"",this.quote=a.charAt(0),this.index=d},a.Quoted.prototype={toCSS:function(){return this.escaped?this.value:this.quote+this.value+this.quote},eval:function(b){this.value=this.value.replace(/@\{([\w-]+)\}/g,function(c,d){return(new a.Variable("@"+d)).eval(b).value}).replace(/`([^`]+)`/g,function(c,d){return(new a.JavaScript(d,this.index,!0)).eval(b).toCSS()});return this}}}(c("less/tree")),function(a){a.Rule=function(b,c,d,e){this.name=b,this.value=c instanceof a.Value?c:new a.Value([c]),this.important=d?" "+d.trim():"",this.index=e,b.charAt(0)==="@"?this.variable=!0:this.variable=!1},a.Rule.prototype.toCSS=function(a){return this.variable?"":this.name+(a.compress?":":": ")+this.value.toCSS(a)+this.important+";"},a.Rule.prototype.eval=function(b){return new a.Rule(this.name,this.value.eval(b),this.important,this.index)},a.Shorthand=function(a,b){this.a=a,this.b=b},a.Shorthand.prototype={toCSS:function(a){return this.a.toCSS(a)+"/"+this.b.toCSS(a)},eval:function(){return this}}}(c("less/tree")),function(a){a.Ruleset=function(a,b){this.selectors=a,this.rules=b,this._lookups={}},a.Ruleset.prototype={eval:function(b){var c=new a.Ruleset(this.selectors,this.rules.slice(0));c.root=this.root,b.frames.unshift(c);if(c.root)for(var d=0;d<c.rules.length;d++)c.rules[d]instanceof a.Import&&Array.prototype.splice.apply(c.rules,[d,1].concat(c.rules[d].eval(b)));for(var d=0;d<c.rules.length;d++)c.rules[d]instanceof a.mixin.Definition&&(c.rules[d].frames=b.frames.slice(0));for(var d=0;d<c.rules.length;d++)c.rules[d]instanceof a.mixin.Call&&Array.prototype.splice.apply(c.rules,[d,1].concat(c.rules[d].eval(b)));for(var d=0,e;d<c.rules.length;d++)e=c.rules[d],e instanceof a.mixin.Definition||(c.rules[d]=e.eval?e.eval(b):e);b.frames.shift();return c},match:function(a){return!a||a.length===0},variables:function(){return this._variables?this._variables:this._variables=this.rules.reduce(function(b,c){c instanceof a.Rule&&c.variable===!0&&(b[c.name]=c);return b},{})},variable:function(a){return this.variables()[a]},rulesets:function(){return this._rulesets?this._rulesets:this._rulesets=this.rules.filter(function(b){return b instanceof a.Ruleset||b instanceof a.mixin.Definition})},find:function(b,c){c=c||this;var d=[],e,f,g=b.toCSS();if(g in this._lookups)return this._lookups[g];this.rulesets().forEach(function(e){if(e!==c)for(var g=0;g<e.selectors.length;g++)if(f=b.match(e.selectors[g])){b.elements.length>1?Array.prototype.push.apply(d,e.find(new a.Selector(b.elements.slice(1)),c)):d.push(e);break}});return this._lookups[g]=d},toCSS:function(b,c){var d=[],e=[],f=[],g=[],h,i;if(!this.root)if(b.length===0)g=this.selectors.map(function(a){return[a]});else for(var j=0;j<this.selectors.length;j++)for(var k=0;k<b.length;k++)g.push(b[k].concat([this.selectors[j]]));for(var l=0;l<this.rules.length;l++)i=this.rules[l],i.rules||i instanceof a.Directive?f.push(i.toCSS(g,c)):i instanceof a.Comment?i.silent||(this.root?f.push(i.toCSS(c)):e.push(i.toCSS(c))):i.toCSS&&!i.variable?e.push(i.toCSS(c)):i.value&&!i.variable&&e.push(i.value.toString());f=f.join(""),this.root?d.push(e.join(c.compress?"":"\n")):e.length>0&&(h=g.map(function(a){return a.map(function(a){return a.toCSS(c)}).join("").trim()}).join(c.compress?",":g.length>3?",\n":", "),d.push(h,(c.compress?"{":" {\n  ")+e.join(c.compress?"":"\n  ")+(c.compress?"}":"\n}\n"))),d.push(f);return d.join("")+(c.compress?"\n":"")}}}(c("less/tree")),function(a){a.Selector=function(a){this.elements=a,this.elements[0].combinator.value===""&&(this.elements[0].combinator.value=" ")},a.Selector.prototype.match=function(a){return this.elements[0].value===a.elements[0].value?!0:!1},a.Selector.prototype.toCSS=function(a){if(this._css)return this._css;return this._css=this.elements.map(function(b){return typeof b=="string"?" "+b.trim():b.toCSS(a)}).join("")}}(c("less/tree")),function(b){b.URL=function(b,c){b.data?this.attrs=b:(!/^(?:https?:\/|file:\/|data:\/)?\//.test(b.value)&&c.length>0&&typeof a!="undefined"&&(b.value=c[0]+(b.value.charAt(0)==="/"?b.value.slice(1):b.value)),this.value=b,this.paths=c)},b.URL.prototype={toCSS:function(){return"url("+(this.attrs?"data:"+this.attrs.mime+this.attrs.charset+this.attrs.base64+this.attrs.data:this.value.toCSS())+")"},eval:function(a){return this.attrs?this:new b.URL(this.value.eval(a),this.paths)}}}(c("less/tree")),function(a){a.Value=function(a){this.value=a,this.is="value"},a.Value.prototype={eval:function(b){return this.value.length===1?this.value[0].eval(b):new a.Value(this.value.map(function(a){return a.eval(b)}))},toCSS:function(a){return this.value.map(function(b){return b.toCSS(a)}).join(a.compress?",":", ")}}}(c("less/tree")),function(a){a.Variable=function(a,b){this.name=a,this.index=b},a.Variable.prototype={eval:function(b){var c,d,e=this.name;e.indexOf("@@")==0&&(e="@"+(new a.Variable(e.slice(1))).eval(b).value);if(c=a.find(b.frames,function(a){if(d=a.variable(e))return d.value.eval(b)}))return c;throw{message:"variable "+e+" is undefined",index:this.index}}}}(c("less/tree")),c("less/tree").find=function(a,b){for(var c=0,d;c<a.length;c++)if(d=b.call(a,a[c]))return d;return null};var g=location.protocol==="file:"||location.protocol==="chrome:"||location.protocol==="resource:";d.env=d.env||(location.hostname=="127.0.0.1"||
location.hostname=="0.0.0.0"||location.hostname=="localhost"||location.port.length>0||g?"development":"production"),d.async=!1,d.poll=d.poll||(g?1e3:1500),d.watch=function(){return this.watchMode=!0},d.unwatch=function(){return this.watchMode=!1},d.env==="development"?(d.optimization=0,/!watch/.test(location.hash)&&d.watch(),d.watchTimer=setInterval(function(){d.watchMode&&n(function(a,b,c){a&&q(a.toCSS(),b,c.lastModified)})},d.poll)):d.optimization=3;var h;try{h=typeof a.localStorage=="undefined"?null:a.localStorage}catch(i){h=null}var j=document.getElementsByTagName("link"),k=/^text\/(x-)?less$/;d.sheets=[];for(var l=0;l<j.length;l++)(j[l].rel==="stylesheet/less"||j[l].rel.match(/stylesheet/)&&j[l].type.match(k))&&d.sheets.push(j[l]);d.refresh=function(a){var b,c;b=c=new Date,n(function(a,d,e){e.local?u("loading "+d.href+" from cache."):(u("parsed "+d.href+" successfully."),q(a.toCSS(),d,e.lastModified)),u("css for "+d.href+" generated in "+(new Date-c)+"ms"),e.remaining===0&&u("css generated in "+(new Date-b)+"ms"),c=new Date},a),m()},d.refreshStyles=m,d.refresh(d.env==="development")})(window)

;


// prettify.js
// http://code.google.com/p/google-code-prettify/

window.PR_SHOULD_USE_CONTINUATION=true;window.PR_TAB_WIDTH=8;window.PR_normalizedHtml=window.PR=window.prettyPrintOne=window.prettyPrint=void 0;window._pr_isIE6=function(){var y=navigator&&navigator.userAgent&&navigator.userAgent.match(/\bMSIE ([678])\./);y=y?+y[1]:false;window._pr_isIE6=function(){return y};return y};
(function(){function y(b){return b.replace(L,"&amp;").replace(M,"&lt;").replace(N,"&gt;")}function H(b,f,i){switch(b.nodeType){case 1:var o=b.tagName.toLowerCase();f.push("<",o);var l=b.attributes,n=l.length;if(n){if(i){for(var r=[],j=n;--j>=0;)r[j]=l[j];r.sort(function(q,m){return q.name<m.name?-1:q.name===m.name?0:1});l=r}for(j=0;j<n;++j){r=l[j];r.specified&&f.push(" ",r.name.toLowerCase(),'="',r.value.replace(L,"&amp;").replace(M,"&lt;").replace(N,"&gt;").replace(X,"&quot;"),'"')}}f.push(">");
for(l=b.firstChild;l;l=l.nextSibling)H(l,f,i);if(b.firstChild||!/^(?:br|link|img)$/.test(o))f.push("</",o,">");break;case 3:case 4:f.push(y(b.nodeValue));break}}function O(b){function f(c){if(c.charAt(0)!=="\\")return c.charCodeAt(0);switch(c.charAt(1)){case "b":return 8;case "t":return 9;case "n":return 10;case "v":return 11;case "f":return 12;case "r":return 13;case "u":case "x":return parseInt(c.substring(2),16)||c.charCodeAt(1);case "0":case "1":case "2":case "3":case "4":case "5":case "6":case "7":return parseInt(c.substring(1),
8);default:return c.charCodeAt(1)}}function i(c){if(c<32)return(c<16?"\\x0":"\\x")+c.toString(16);c=String.fromCharCode(c);if(c==="\\"||c==="-"||c==="["||c==="]")c="\\"+c;return c}function o(c){var d=c.substring(1,c.length-1).match(RegExp("\\\\u[0-9A-Fa-f]{4}|\\\\x[0-9A-Fa-f]{2}|\\\\[0-3][0-7]{0,2}|\\\\[0-7]{1,2}|\\\\[\\s\\S]|-|[^-\\\\]","g"));c=[];for(var a=[],k=d[0]==="^",e=k?1:0,h=d.length;e<h;++e){var g=d[e];switch(g){case "\\B":case "\\b":case "\\D":case "\\d":case "\\S":case "\\s":case "\\W":case "\\w":c.push(g);
continue}g=f(g);var s;if(e+2<h&&"-"===d[e+1]){s=f(d[e+2]);e+=2}else s=g;a.push([g,s]);if(!(s<65||g>122)){s<65||g>90||a.push([Math.max(65,g)|32,Math.min(s,90)|32]);s<97||g>122||a.push([Math.max(97,g)&-33,Math.min(s,122)&-33])}}a.sort(function(v,w){return v[0]-w[0]||w[1]-v[1]});d=[];g=[NaN,NaN];for(e=0;e<a.length;++e){h=a[e];if(h[0]<=g[1]+1)g[1]=Math.max(g[1],h[1]);else d.push(g=h)}a=["["];k&&a.push("^");a.push.apply(a,c);for(e=0;e<d.length;++e){h=d[e];a.push(i(h[0]));if(h[1]>h[0]){h[1]+1>h[0]&&a.push("-");
a.push(i(h[1]))}}a.push("]");return a.join("")}function l(c){for(var d=c.source.match(RegExp("(?:\\[(?:[^\\x5C\\x5D]|\\\\[\\s\\S])*\\]|\\\\u[A-Fa-f0-9]{4}|\\\\x[A-Fa-f0-9]{2}|\\\\[0-9]+|\\\\[^ux0-9]|\\(\\?[:!=]|[\\(\\)\\^]|[^\\x5B\\x5C\\(\\)\\^]+)","g")),a=d.length,k=[],e=0,h=0;e<a;++e){var g=d[e];if(g==="(")++h;else if("\\"===g.charAt(0))if((g=+g.substring(1))&&g<=h)k[g]=-1}for(e=1;e<k.length;++e)if(-1===k[e])k[e]=++n;for(h=e=0;e<a;++e){g=d[e];if(g==="("){++h;if(k[h]===undefined)d[e]="(?:"}else if("\\"===
g.charAt(0))if((g=+g.substring(1))&&g<=h)d[e]="\\"+k[h]}for(h=e=0;e<a;++e)if("^"===d[e]&&"^"!==d[e+1])d[e]="";if(c.ignoreCase&&r)for(e=0;e<a;++e){g=d[e];c=g.charAt(0);if(g.length>=2&&c==="[")d[e]=o(g);else if(c!=="\\")d[e]=g.replace(/[a-zA-Z]/g,function(s){s=s.charCodeAt(0);return"["+String.fromCharCode(s&-33,s|32)+"]"})}return d.join("")}for(var n=0,r=false,j=false,q=0,m=b.length;q<m;++q){var t=b[q];if(t.ignoreCase)j=true;else if(/[a-z]/i.test(t.source.replace(/\\u[0-9a-f]{4}|\\x[0-9a-f]{2}|\\[^ux]/gi,
""))){r=true;j=false;break}}var p=[];q=0;for(m=b.length;q<m;++q){t=b[q];if(t.global||t.multiline)throw Error(""+t);p.push("(?:"+l(t)+")")}return RegExp(p.join("|"),j?"gi":"g")}function Y(b){var f=0;return function(i){for(var o=null,l=0,n=0,r=i.length;n<r;++n)switch(i.charAt(n)){case "\t":o||(o=[]);o.push(i.substring(l,n));l=b-f%b;for(f+=l;l>=0;l-=16)o.push("                ".substring(0,l));l=n+1;break;case "\n":f=0;break;default:++f}if(!o)return i;o.push(i.substring(l));return o.join("")}}function I(b,
f,i,o){if(f){b={source:f,c:b};i(b);o.push.apply(o,b.d)}}function B(b,f){var i={},o;(function(){for(var r=b.concat(f),j=[],q={},m=0,t=r.length;m<t;++m){var p=r[m],c=p[3];if(c)for(var d=c.length;--d>=0;)i[c.charAt(d)]=p;p=p[1];c=""+p;if(!q.hasOwnProperty(c)){j.push(p);q[c]=null}}j.push(/[\0-\uffff]/);o=O(j)})();var l=f.length;function n(r){for(var j=r.c,q=[j,z],m=0,t=r.source.match(o)||[],p={},c=0,d=t.length;c<d;++c){var a=t[c],k=p[a],e=void 0,h;if(typeof k==="string")h=false;else{var g=i[a.charAt(0)];
if(g){e=a.match(g[1]);k=g[0]}else{for(h=0;h<l;++h){g=f[h];if(e=a.match(g[1])){k=g[0];break}}e||(k=z)}if((h=k.length>=5&&"lang-"===k.substring(0,5))&&!(e&&typeof e[1]==="string")){h=false;k=P}h||(p[a]=k)}g=m;m+=a.length;if(h){h=e[1];var s=a.indexOf(h),v=s+h.length;if(e[2]){v=a.length-e[2].length;s=v-h.length}k=k.substring(5);I(j+g,a.substring(0,s),n,q);I(j+g+s,h,Q(k,h),q);I(j+g+v,a.substring(v),n,q)}else q.push(j+g,k)}r.d=q}return n}function x(b){var f=[],i=[];if(b.tripleQuotedStrings)f.push([A,/^(?:\'\'\'(?:[^\'\\]|\\[\s\S]|\'{1,2}(?=[^\']))*(?:\'\'\'|$)|\"\"\"(?:[^\"\\]|\\[\s\S]|\"{1,2}(?=[^\"]))*(?:\"\"\"|$)|\'(?:[^\\\']|\\[\s\S])*(?:\'|$)|\"(?:[^\\\"]|\\[\s\S])*(?:\"|$))/,
null,"'\""]);else b.multiLineStrings?f.push([A,/^(?:\'(?:[^\\\']|\\[\s\S])*(?:\'|$)|\"(?:[^\\\"]|\\[\s\S])*(?:\"|$)|\`(?:[^\\\`]|\\[\s\S])*(?:\`|$))/,null,"'\"`"]):f.push([A,/^(?:\'(?:[^\\\'\r\n]|\\.)*(?:\'|$)|\"(?:[^\\\"\r\n]|\\.)*(?:\"|$))/,null,"\"'"]);b.verbatimStrings&&i.push([A,/^@\"(?:[^\"]|\"\")*(?:\"|$)/,null]);if(b.hashComments)if(b.cStyleComments){f.push([C,/^#(?:(?:define|elif|else|endif|error|ifdef|include|ifndef|line|pragma|undef|warning)\b|[^\r\n]*)/,null,"#"]);i.push([A,/^<(?:(?:(?:\.\.\/)*|\/?)(?:[\w-]+(?:\/[\w-]+)+)?[\w-]+\.h|[a-z]\w*)>/,
null])}else f.push([C,/^#[^\r\n]*/,null,"#"]);if(b.cStyleComments){i.push([C,/^\/\/[^\r\n]*/,null]);i.push([C,/^\/\*[\s\S]*?(?:\*\/|$)/,null])}b.regexLiterals&&i.push(["lang-regex",RegExp("^"+Z+"(/(?=[^/*])(?:[^/\\x5B\\x5C]|\\x5C[\\s\\S]|\\x5B(?:[^\\x5C\\x5D]|\\x5C[\\s\\S])*(?:\\x5D|$))+/)")]);b=b.keywords.replace(/^\s+|\s+$/g,"");b.length&&i.push([R,RegExp("^(?:"+b.replace(/\s+/g,"|")+")\\b"),null]);f.push([z,/^\s+/,null," \r\n\t\u00a0"]);i.push([J,/^@[a-z_$][a-z_$@0-9]*/i,null],[S,/^@?[A-Z]+[a-z][A-Za-z_$@0-9]*/,
null],[z,/^[a-z_$][a-z_$@0-9]*/i,null],[J,/^(?:0x[a-f0-9]+|(?:\d(?:_\d+)*\d*(?:\.\d*)?|\.\d\+)(?:e[+\-]?\d+)?)[a-z]*/i,null,"0123456789"],[E,/^.[^\s\w\.$@\'\"\`\/\#]*/,null]);return B(f,i)}function $(b){function f(D){if(D>r){if(j&&j!==q){n.push("</span>");j=null}if(!j&&q){j=q;n.push('<span class="',j,'">')}var T=y(p(i.substring(r,D))).replace(e?d:c,"$1&#160;");e=k.test(T);n.push(T.replace(a,s));r=D}}var i=b.source,o=b.g,l=b.d,n=[],r=0,j=null,q=null,m=0,t=0,p=Y(window.PR_TAB_WIDTH),c=/([\r\n ]) /g,
d=/(^| ) /gm,a=/\r\n?|\n/g,k=/[ \r\n]$/,e=true,h=window._pr_isIE6();h=h?b.b.tagName==="PRE"?h===6?"&#160;\r\n":h===7?"&#160;<br>\r":"&#160;\r":"&#160;<br />":"<br />";var g=b.b.className.match(/\blinenums\b(?::(\d+))?/),s;if(g){for(var v=[],w=0;w<10;++w)v[w]=h+'</li><li class="L'+w+'">';var F=g[1]&&g[1].length?g[1]-1:0;n.push('<ol class="linenums"><li class="L',F%10,'"');F&&n.push(' value="',F+1,'"');n.push(">");s=function(){var D=v[++F%10];return j?"</span>"+D+'<span class="'+j+'">':D}}else s=h;
for(;;)if(m<o.length?t<l.length?o[m]<=l[t]:true:false){f(o[m]);if(j){n.push("</span>");j=null}n.push(o[m+1]);m+=2}else if(t<l.length){f(l[t]);q=l[t+1];t+=2}else break;f(i.length);j&&n.push("</span>");g&&n.push("</li></ol>");b.a=n.join("")}function u(b,f){for(var i=f.length;--i>=0;){var o=f[i];if(G.hasOwnProperty(o))"console"in window&&console.warn("cannot override language handler %s",o);else G[o]=b}}function Q(b,f){b&&G.hasOwnProperty(b)||(b=/^\s*</.test(f)?"default-markup":"default-code");return G[b]}
function U(b){var f=b.f,i=b.e;b.a=f;try{var o,l=f.match(aa);f=[];var n=0,r=[];if(l)for(var j=0,q=l.length;j<q;++j){var m=l[j];if(m.length>1&&m.charAt(0)==="<"){if(!ba.test(m))if(ca.test(m)){f.push(m.substring(9,m.length-3));n+=m.length-12}else if(da.test(m)){f.push("\n");++n}else if(m.indexOf(V)>=0&&m.replace(/\s(\w+)\s*=\s*(?:\"([^\"]*)\"|'([^\']*)'|(\S+))/g,' $1="$2$3$4"').match(/[cC][lL][aA][sS][sS]=\"[^\"]*\bnocode\b/)){var t=m.match(W)[2],p=1,c;c=j+1;a:for(;c<q;++c){var d=l[c].match(W);if(d&&
d[2]===t)if(d[1]==="/"){if(--p===0)break a}else++p}if(c<q){r.push(n,l.slice(j,c+1).join(""));j=c}else r.push(n,m)}else r.push(n,m)}else{var a;p=m;var k=p.indexOf("&");if(k<0)a=p;else{for(--k;(k=p.indexOf("&#",k+1))>=0;){var e=p.indexOf(";",k);if(e>=0){var h=p.substring(k+3,e),g=10;if(h&&h.charAt(0)==="x"){h=h.substring(1);g=16}var s=parseInt(h,g);isNaN(s)||(p=p.substring(0,k)+String.fromCharCode(s)+p.substring(e+1))}}a=p.replace(ea,"<").replace(fa,">").replace(ga,"'").replace(ha,'"').replace(ia," ").replace(ja,
"&")}f.push(a);n+=a.length}}o={source:f.join(""),h:r};var v=o.source;b.source=v;b.c=0;b.g=o.h;Q(i,v)(b);$(b)}catch(w){if("console"in window)console.log(w&&w.stack?w.stack:w)}}var A="str",R="kwd",C="com",S="typ",J="lit",E="pun",z="pln",P="src",V="nocode",Z=function(){for(var b=["!","!=","!==","#","%","%=","&","&&","&&=","&=","(","*","*=","+=",",","-=","->","/","/=",":","::",";","<","<<","<<=","<=","=","==","===",">",">=",">>",">>=",">>>",">>>=","?","@","[","^","^=","^^","^^=","{","|","|=","||","||=",
"~","break","case","continue","delete","do","else","finally","instanceof","return","throw","try","typeof"],f="(?:^^|[+-]",i=0;i<b.length;++i)f+="|"+b[i].replace(/([^=<>:&a-z])/g,"\\$1");f+=")\\s*";return f}(),L=/&/g,M=/</g,N=/>/g,X=/\"/g,ea=/&lt;/g,fa=/&gt;/g,ga=/&apos;/g,ha=/&quot;/g,ja=/&amp;/g,ia=/&nbsp;/g,ka=/[\r\n]/g,K=null,aa=RegExp("[^<]+|<!--[\\s\\S]*?--\>|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|</?[a-zA-Z](?:[^>\"']|'[^']*'|\"[^\"]*\")*>|<","g"),ba=/^<\!--/,ca=/^<!\[CDATA\[/,da=/^<br\b/i,W=/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/,
la=x({keywords:"break continue do else for if return while auto case char const default double enum extern float goto int long register short signed sizeof static struct switch typedef union unsigned void volatile catch class delete false import new operator private protected public this throw true try typeof alignof align_union asm axiom bool concept concept_map const_cast constexpr decltype dynamic_cast explicit export friend inline late_check mutable namespace nullptr reinterpret_cast static_assert static_cast template typeid typename using virtual wchar_t where break continue do else for if return while auto case char const default double enum extern float goto int long register short signed sizeof static struct switch typedef union unsigned void volatile catch class delete false import new operator private protected public this throw true try typeof abstract boolean byte extends final finally implements import instanceof null native package strictfp super synchronized throws transient as base by checked decimal delegate descending event fixed foreach from group implicit in interface internal into is lock object out override orderby params partial readonly ref sbyte sealed stackalloc string select uint ulong unchecked unsafe ushort var break continue do else for if return while auto case char const default double enum extern float goto int long register short signed sizeof static struct switch typedef union unsigned void volatile catch class delete false import new operator private protected public this throw true try typeof debugger eval export function get null set undefined var with Infinity NaN caller delete die do dump elsif eval exit foreach for goto if import last local my next no our print package redo require sub undef unless until use wantarray while BEGIN END break continue do else for if return while and as assert class def del elif except exec finally from global import in is lambda nonlocal not or pass print raise try with yield False True None break continue do else for if return while alias and begin case class def defined elsif end ensure false in module next nil not or redo rescue retry self super then true undef unless until when yield BEGIN END break continue do else for if return while case done elif esac eval fi function in local set then until ",
hashComments:true,cStyleComments:true,multiLineStrings:true,regexLiterals:true}),G={};u(la,["default-code"]);u(B([],[[z,/^[^<?]+/],["dec",/^<!\w[^>]*(?:>|$)/],[C,/^<\!--[\s\S]*?(?:-\->|$)/],["lang-",/^<\?([\s\S]+?)(?:\?>|$)/],["lang-",/^<%([\s\S]+?)(?:%>|$)/],[E,/^(?:<[%?]|[%?]>)/],["lang-",/^<xmp\b[^>]*>([\s\S]+?)<\/xmp\b[^>]*>/i],["lang-js",/^<script\b[^>]*>([\s\S]*?)(<\/script\b[^>]*>)/i],["lang-css",/^<style\b[^>]*>([\s\S]*?)(<\/style\b[^>]*>)/i],["lang-in.tag",/^(<\/?[a-z][^<>]*>)/i]]),["default-markup",
"htm","html","mxml","xhtml","xml","xsl"]);u(B([[z,/^[\s]+/,null," \t\r\n"],["atv",/^(?:\"[^\"]*\"?|\'[^\']*\'?)/,null,"\"'"]],[["tag",/^^<\/?[a-z](?:[\w.:-]*\w)?|\/?>$/i],["atn",/^(?!style[\s=]|on)[a-z](?:[\w:-]*\w)?/i],["lang-uq.val",/^=\s*([^>\'\"\s]*(?:[^>\'\"\s\/]|\/(?=\s)))/],[E,/^[=<>\/]+/],["lang-js",/^on\w+\s*=\s*\"([^\"]+)\"/i],["lang-js",/^on\w+\s*=\s*\'([^\']+)\'/i],["lang-js",/^on\w+\s*=\s*([^\"\'>\s]+)/i],["lang-css",/^style\s*=\s*\"([^\"]+)\"/i],["lang-css",/^style\s*=\s*\'([^\']+)\'/i],
["lang-css",/^style\s*=\s*([^\"\'>\s]+)/i]]),["in.tag"]);u(B([],[["atv",/^[\s\S]+/]]),["uq.val"]);u(x({keywords:"break continue do else for if return while auto case char const default double enum extern float goto int long register short signed sizeof static struct switch typedef union unsigned void volatile catch class delete false import new operator private protected public this throw true try typeof alignof align_union asm axiom bool concept concept_map const_cast constexpr decltype dynamic_cast explicit export friend inline late_check mutable namespace nullptr reinterpret_cast static_assert static_cast template typeid typename using virtual wchar_t where ",
hashComments:true,cStyleComments:true}),["c","cc","cpp","cxx","cyc","m"]);u(x({keywords:"null true false"}),["json"]);u(x({keywords:"break continue do else for if return while auto case char const default double enum extern float goto int long register short signed sizeof static struct switch typedef union unsigned void volatile catch class delete false import new operator private protected public this throw true try typeof abstract boolean byte extends final finally implements import instanceof null native package strictfp super synchronized throws transient as base by checked decimal delegate descending event fixed foreach from group implicit in interface internal into is lock object out override orderby params partial readonly ref sbyte sealed stackalloc string select uint ulong unchecked unsafe ushort var ",
hashComments:true,cStyleComments:true,verbatimStrings:true}),["cs"]);u(x({keywords:"break continue do else for if return while auto case char const default double enum extern float goto int long register short signed sizeof static struct switch typedef union unsigned void volatile catch class delete false import new operator private protected public this throw true try typeof abstract boolean byte extends final finally implements import instanceof null native package strictfp super synchronized throws transient ",
cStyleComments:true}),["java"]);u(x({keywords:"break continue do else for if return while case done elif esac eval fi function in local set then until ",hashComments:true,multiLineStrings:true}),["bsh","csh","sh"]);u(x({keywords:"break continue do else for if return while and as assert class def del elif except exec finally from global import in is lambda nonlocal not or pass print raise try with yield False True None ",hashComments:true,multiLineStrings:true,tripleQuotedStrings:true}),["cv","py"]);
u(x({keywords:"caller delete die do dump elsif eval exit foreach for goto if import last local my next no our print package redo require sub undef unless until use wantarray while BEGIN END ",hashComments:true,multiLineStrings:true,regexLiterals:true}),["perl","pl","pm"]);u(x({keywords:"break continue do else for if return while alias and begin case class def defined elsif end ensure false in module next nil not or redo rescue retry self super then true undef unless until when yield BEGIN END ",hashComments:true,
multiLineStrings:true,regexLiterals:true}),["rb"]);u(x({keywords:"break continue do else for if return while auto case char const default double enum extern float goto int long register short signed sizeof static struct switch typedef union unsigned void volatile catch class delete false import new operator private protected public this throw true try typeof debugger eval export function get null set undefined var with Infinity NaN ",cStyleComments:true,regexLiterals:true}),["js"]);u(B([],[[A,/^[\s\S]+/]]),
["regex"]);window.PR_normalizedHtml=H;window.prettyPrintOne=function(b,f){var i={f:b,e:f};U(i);return i.a};window.prettyPrint=function(b){function f(){for(var t=window.PR_SHOULD_USE_CONTINUATION?j.now()+250:Infinity;q<o.length&&j.now()<t;q++){var p=o[q];if(p.className&&p.className.indexOf("prettyprint")>=0){var c=p.className.match(/\blang-(\w+)\b/);if(c)c=c[1];for(var d=false,a=p.parentNode;a;a=a.parentNode)if((a.tagName==="pre"||a.tagName==="code"||a.tagName==="xmp")&&a.className&&a.className.indexOf("prettyprint")>=
0){d=true;break}if(!d){a=p;if(null===K){d=document.createElement("PRE");d.appendChild(document.createTextNode('<!DOCTYPE foo PUBLIC "foo bar">\n<foo />'));K=!/</.test(d.innerHTML)}if(K){d=a.innerHTML;if("XMP"===a.tagName)d=y(d);else{a=a;if("PRE"===a.tagName)a=true;else if(ka.test(d)){var k="";if(a.currentStyle)k=a.currentStyle.whiteSpace;else if(window.getComputedStyle)k=window.getComputedStyle(a,null).whiteSpace;a=!k||k==="pre"}else a=true;a||(d=d.replace(/(<br\s*\/?>)[\r\n]+/g,"$1").replace(/(?:[\r\n]+[ \t]*)+/g,
" "))}d=d}else{d=[];for(a=a.firstChild;a;a=a.nextSibling)H(a,d);d=d.join("")}d=d.replace(/(?:\r\n?|\n)$/,"");m={f:d,e:c,b:p};U(m);if(p=m.a){c=m.b;if("XMP"===c.tagName){d=document.createElement("PRE");for(a=0;a<c.attributes.length;++a){k=c.attributes[a];if(k.specified)if(k.name.toLowerCase()==="class")d.className=k.value;else d.setAttribute(k.name,k.value)}d.innerHTML=p;c.parentNode.replaceChild(d,c)}else c.innerHTML=p}}}}if(q<o.length)setTimeout(f,250);else b&&b()}for(var i=[document.getElementsByTagName("pre"),
document.getElementsByTagName("code"),document.getElementsByTagName("xmp")],o=[],l=0;l<i.length;++l)for(var n=0,r=i[l].length;n<r;++n)o.push(i[l][n]);i=null;var j=Date;j.now||(j={now:function(){return(new Date).getTime()}});var q=0,m;f()};window.PR={combinePrefixPatterns:O,createSimpleLexer:B,registerLangHandler:u,sourceDecorator:x,PR_ATTRIB_NAME:"atn",PR_ATTRIB_VALUE:"atv",PR_COMMENT:C,PR_DECLARATION:"dec",PR_KEYWORD:R,PR_LITERAL:J,PR_NOCODE:V,PR_PLAIN:z,PR_PUNCTUATION:E,PR_SOURCE:P,PR_STRING:A,
PR_TAG:"tag",PR_TYPE:S}})()

;

// lang-sql.js
// http://code.google.com/p/google-code-prettify/

PR.registerLangHandler(PR.createSimpleLexer([["pln",/^[\t\n\r \xA0]+/,null,"\t\n\r \u00a0"],["str",/^(?:"(?:[^\"\\]|\\.)*"|'(?:[^\'\\]|\\.)*')/,null,"\"'"]],[["com",/^(?:--[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$))/],["kwd",/^(?:ADD|ALL|ALTER|AND|ANY|AS|ASC|AUTHORIZATION|BACKUP|BEGIN|BETWEEN|BREAK|BROWSE|BULK|BY|CASCADE|CASE|CHECK|CHECKPOINT|CLOSE|CLUSTERED|COALESCE|COLLATE|COLUMN|COMMIT|COMPUTE|CONSTRAINT|CONTAINS|CONTAINSTABLE|CONTINUE|CONVERT|CREATE|CROSS|CURRENT|CURRENT_DATE|CURRENT_TIME|CURRENT_TIMESTAMP|CURRENT_USER|CURSOR|DATABASE|DBCC|DEALLOCATE|DECLARE|DEFAULT|DELETE|DENY|DESC|DISK|DISTINCT|DISTRIBUTED|DOUBLE|DROP|DUMMY|DUMP|ELSE|END|ERRLVL|ESCAPE|EXCEPT|EXEC|EXECUTE|EXISTS|EXIT|FETCH|FILE|FILLFACTOR|FOR|FOREIGN|FREETEXT|FREETEXTTABLE|FROM|FULL|FUNCTION|GOTO|GRANT|GROUP|HAVING|HOLDLOCK|IDENTITY|IDENTITYCOL|IDENTITY_INSERT|IF|IN|INDEX|INNER|INSERT|INTERSECT|INTO|IS|JOIN|KEY|KILL|LEFT|LIKE|LINENO|LOAD|NATIONAL|NOCHECK|NONCLUSTERED|NOT|NULL|NULLIF|OF|OFF|OFFSETS|ON|OPEN|OPENDATASOURCE|OPENQUERY|OPENROWSET|OPENXML|OPTION|OR|ORDER|OUTER|OVER|PERCENT|PLAN|PRECISION|PRIMARY|PRINT|PROC|PROCEDURE|PUBLIC|RAISERROR|READ|READTEXT|RECONFIGURE|REFERENCES|REPLICATION|RESTORE|RESTRICT|RETURN|REVOKE|RIGHT|ROLLBACK|ROWCOUNT|ROWGUIDCOL|RULE|SAVE|SCHEMA|SELECT|SESSION_USER|SET|SETUSER|SHUTDOWN|SOME|STATISTICS|SYSTEM_USER|TABLE|TEXTSIZE|THEN|TO|TOP|TRAN|TRANSACTION|TRIGGER|TRUNCATE|TSEQUAL|UNION|UNIQUE|UPDATE|UPDATETEXT|USE|USER|VALUES|VARYING|VIEW|WAITFOR|WHEN|WHERE|WHILE|WITH|WRITETEXT)(?=[^\w-]|$)/i,
null],["lit",/^[+-]?(?:0x[\da-f]+|(?:(?:\.\d+|\d+(?:\.\d*)?)(?:e[+\-]?\d+)?))/i],["pln",/^[a-z_][\w-]*/i],["pun",/^[^\w\t\n\r \xA0\"\'][^\w\t\n\r \xA0+\-\"\']*/]]),["sql"])

;

/*
* jQuery Color Animations
* Copyright 2007 John Resig
* Released under the MIT and GPL licenses.
*/

(function (jQuery) {

    // We override the animation for all of these color styles
    jQuery.each(['backgroundColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'borderTopColor', 'color', 'outlineColor'], function (i, attr) {
        jQuery.fx.step[attr] = function (fx) {
            if (!fx.colorInit) {
                fx.start = getColor(fx.elem, attr);
                fx.end = getRGB(fx.end);
                fx.colorInit = true;
            }
            fx.elem.style[attr] = "rgb(" + [
            Math.max(Math.min(parseInt((fx.pos * (fx.end[0] - fx.start[0])) + fx.start[0]), 255), 0), Math.max(Math.min(parseInt((fx.pos * (fx.end[1] - fx.start[1])) + fx.start[1]), 255), 0), Math.max(Math.min(parseInt((fx.pos * (fx.end[2] - fx.start[2])) + fx.start[2]), 255), 0)].join(",") + ")";
        }
    });

    // Color Conversion functions from highlightFade
    // By Blair Mitchelmore
    // http://jquery.offput.ca/highlightFade/
    // Parse strings looking for color tuples [255,255,255]

    function getRGB(color) {
        var result;

        // Check if we're already dealing with an array of colors
        if (color && color.constructor == Array && color.length == 3) return color;

        // Look for rgb(num,num,num)
        if (result = /rgb\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*\)/.exec(color)) return [parseInt(result[1]), parseInt(result[2]), parseInt(result[3])];

        // Look for rgb(num%,num%,num%)
        if (result = /rgb\(\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*\)/.exec(color)) return [parseFloat(result[1]) * 2.55, parseFloat(result[2]) * 2.55, parseFloat(result[3]) * 2.55];

        // Look for #a0b1c2
        if (result = /#([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})/.exec(color)) return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];

        // Look for #fff
        if (result = /#([a-fA-F0-9])([a-fA-F0-9])([a-fA-F0-9])/.exec(color)) return [parseInt(result[1] + result[1], 16), parseInt(result[2] + result[2], 16), parseInt(result[3] + result[3], 16)];

        // Look for rgba(0, 0, 0, 0) == transparent in Safari 3
        if (result = /rgba\(0, 0, 0, 0\)/.exec(color)) return colors['transparent'];

        // Otherwise, we're most likely dealing with a named color
        return colors[jQuery.trim(color).toLowerCase()];
    }

    function getColor(elem, attr) {
        var color;

        do {
            color = jQuery.curCSS(elem, attr);

            // Keep going until we find an element that has color, or we hit the body
            if (color != '' && color != 'transparent' || jQuery.nodeName(elem, "body")) break;

            attr = "backgroundColor";
        } while (elem = elem.parentNode);

        return getRGB(color);
    };

    // Some named colors to work with
    // From Interface by Stefan Petre
    // http://interface.eyecon.ro/
    var colors = { };

})(jQuery);

// http://api.jquery.com/category/plugins/templates/
(function(a){var r=a.fn.domManip,d="_tmplitem",q=/^[^<]*(<[\w\W]+>)[^>]*$|\{\{\! /,b={},f={},e,p={key:0,data:{}},h=0,c=0,l=[];function g(e,d,g,i){var c={data:i||(d?d.data:{}),_wrap:d?d._wrap:null,tmpl:null,parent:d||null,nodes:[],calls:u,nest:w,wrap:x,html:v,update:t};e&&a.extend(c,e,{nodes:[],parent:d});if(g){c.tmpl=g;c._ctnt=c._ctnt||c.tmpl(a,c);c.key=++h;(l.length?f:b)[h]=c}return c}a.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(f,d){a.fn[f]=function(n){var g=[],i=a(n),k,h,m,l,j=this.length===1&&this[0].parentNode;e=b||{};if(j&&j.nodeType===11&&j.childNodes.length===1&&i.length===1){i[d](this[0]);g=this}else{for(h=0,m=i.length;h<m;h++){c=h;k=(h>0?this.clone(true):this).get();a.fn[d].apply(a(i[h]),k);g=g.concat(k)}c=0;g=this.pushStack(g,f,i.selector)}l=e;e=null;a.tmpl.complete(l);return g}});a.fn.extend({tmpl:function(d,c,b){return a.tmpl(this[0],d,c,b)},tmplItem:function(){return a.tmplItem(this[0])},template:function(b){return a.template(b,this[0])},domManip:function(d,l,j){if(d[0]&&d[0].nodeType){var f=a.makeArray(arguments),g=d.length,i=0,h;while(i<g&&!(h=a.data(d[i++],"tmplItem")));if(g>1)f[0]=[a.makeArray(d)];if(h&&c)f[2]=function(b){a.tmpl.afterManip(this,b,j)};r.apply(this,f)}else r.apply(this,arguments);c=0;!e&&a.tmpl.complete(b);return this}});a.extend({tmpl:function(d,h,e,c){var j,k=!c;if(k){c=p;d=a.template[d]||a.template(null,d);f={}}else if(!d){d=c.tmpl;b[c.key]=c;c.nodes=[];c.wrapped&&n(c,c.wrapped);return a(i(c,null,c.tmpl(a,c)))}if(!d)return[];if(typeof h==="function")h=h.call(c||{});e&&e.wrapped&&n(e,e.wrapped);j=a.isArray(h)?a.map(h,function(a){return a?g(e,c,d,a):null}):[g(e,c,d,h)];return k?a(i(c,null,j)):j},tmplItem:function(b){var c;if(b instanceof a)b=b[0];while(b&&b.nodeType===1&&!(c=a.data(b,"tmplItem"))&&(b=b.parentNode));return c||p},template:function(c,b){if(b){if(typeof b==="string")b=o(b);else if(b instanceof a)b=b[0]||{};if(b.nodeType)b=a.data(b,"tmpl")||a.data(b,"tmpl",o(b.innerHTML));return typeof c==="string"?(a.template[c]=b):b}return c?typeof c!=="string"?a.template(null,c):a.template[c]||a.template(null,q.test(c)?c:a(c)):null},encode:function(a){return(""+a).split("<").join("&lt;").split(">").join("&gt;").split('"').join("&#34;").split("'").join("&#39;")}});a.extend(a.tmpl,{tag:{tmpl:{_default:{$2:"null"},open:"if($notnull_1){_=_.concat($item.nest($1,$2));}"},wrap:{_default:{$2:"null"},open:"$item.calls(_,$1,$2);_=[];",close:"call=$item.calls();_=call._.concat($item.wrap(call,_));"},each:{_default:{$2:"$index, $value"},open:"if($notnull_1){$.each($1a,function($2){with(this){",close:"}});}"},"if":{open:"if(($notnull_1) && $1a){",close:"}"},"else":{_default:{$1:"true"},open:"}else if(($notnull_1) && $1a){"},html:{open:"if($notnull_1){_.push($1a);}"},"=":{_default:{$1:"$data"},open:"if($notnull_1){_.push($.encode($1a));}"},"!":{open:""}},complete:function(){b={}},afterManip:function(f,b,d){var e=b.nodeType===11?a.makeArray(b.childNodes):b.nodeType===1?[b]:[];d.call(f,b);m(e);c++}});function i(e,g,f){var b,c=f?a.map(f,function(a){return typeof a==="string"?e.key?a.replace(/(<\w+)(?=[\s>])(?![^>]*_tmplitem)([^>]*)/g,"$1 "+d+'="'+e.key+'" $2'):a:i(a,e,a._ctnt)}):e;if(g)return c;c=c.join("");c.replace(/^\s*([^<\s][^<]*)?(<[\w\W]+>)([^>]*[^>\s])?\s*$/,function(f,c,e,d){b=a(e).get();m(b);if(c)b=j(c).concat(b);if(d)b=b.concat(j(d))});return b?b:j(c)}function j(c){var b=document.createElement("div");b.innerHTML=c;return a.makeArray(b.childNodes)}function o(b){return new Function("jQuery","$item","var $=jQuery,call,_=[],$data=$item.data;with($data){_.push('"+a.trim(b).replace(/([\\'])/g,"\\$1").replace(/[\r\t\n]/g," ").replace(/\$\{([^\}]*)\}/g,"{{= $1}}").replace(/\{\{(\/?)(\w+|.)(?:\(((?:[^\}]|\}(?!\}))*?)?\))?(?:\s+(.*?)?)?(\(((?:[^\}]|\}(?!\}))*?)\))?\s*\}\}/g,function(m,l,j,d,b,c,e){var i=a.tmpl.tag[j],h,f,g;if(!i)throw"Template command not found: "+j;h=i._default||[];if(c&&!/\w$/.test(b)){b+=c;c=""}if(b){b=k(b);e=e?","+k(e)+")":c?")":"";f=c?b.indexOf(".")>-1?b+c:"("+b+").call($item"+e:b;g=c?f:"(typeof("+b+")==='function'?("+b+").call($item):("+b+"))"}else g=f=h.$1||"null";d=k(d);return"');"+i[l?"close":"open"].split("$notnull_1").join(b?"typeof("+b+")!=='undefined' && ("+b+")!=null":"true").split("$1a").join(g).split("$1").join(f).split("$2").join(d?d.replace(/\s*([^\(]+)\s*(\((.*?)\))?/g,function(d,c,b,a){a=a?","+a+")":b?")":"";return a?"("+c+").call($item"+a:d}):h.$2||"")+"_.push('"})+"');}return _;")}function n(c,b){c._wrap=i(c,true,a.isArray(b)?b:[q.test(b)?b:a(b).html()]).join("")}function k(a){return a?a.replace(/\\'/g,"'").replace(/\\\\/g,"\\"):null}function s(b){var a=document.createElement("div");a.appendChild(b.cloneNode(true));return a.innerHTML}function m(o){var n="_"+c,k,j,l={},e,p,i;for(e=0,p=o.length;e<p;e++){if((k=o[e]).nodeType!==1)continue;j=k.getElementsByTagName("*");for(i=j.length-1;i>=0;i--)m(j[i]);m(k)}function m(j){var p,i=j,k,e,m;if(m=j.getAttribute(d)){while(i.parentNode&&(i=i.parentNode).nodeType===1&&!(p=i.getAttribute(d)));if(p!==m){i=i.parentNode?i.nodeType===11?0:i.getAttribute(d)||0:0;if(!(e=b[m])){e=f[m];e=g(e,b[i]||f[i],null,true);e.key=++h;b[h]=e}c&&o(m)}j.removeAttribute(d)}else if(c&&(e=a.data(j,"tmplItem"))){o(e.key);b[e.key]=e;i=a.data(j.parentNode,"tmplItem");i=i?i.key:0}if(e){k=e;while(k&&k.key!=i){k.nodes.push(j);k=k.parent}delete e._ctnt;delete e._wrap;a.data(j,"tmplItem",e)}function o(a){a=a+n;e=l[a]=l[a]||g(e,b[e.parent.key+n]||e.parent,null,true)}}}function u(a,d,c,b){if(!a)return l.pop();l.push({_:a,tmpl:d,item:this,data:c,options:b})}function w(d,c,b){return a.tmpl(a.template(d),c,b,this)}function x(b,d){var c=b.options||{};c.wrapped=d;return a.tmpl(a.template(b.tmpl),b.data,c,b.item)}function v(d,c){var b=this._wrap;return a.map(a(a.isArray(b)?b.join(""):b).filter(d||"*"),function(a){return c?a.innerText||a.textContent:a.outerHTML||s(a)})}function t(){var b=this.nodes;a.tmpl(null,null,null,this).insertBefore(b[0]);a(b).remove()}})(jQuery);