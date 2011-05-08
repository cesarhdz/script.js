/**
 * A helper for loading remote javascript using the "script tag hack".
 * The <script> tags might fetch any (remote) javascript by specifying
 * a 'src' attribute - they are not constrained by the same origin policy
 * as AJAX requests.
 * Loading might be defered until DOM is ready using the 'onLoad' argument.
 * Besides there's special support for scripts that write directly to the
 * DOM using <code>document.write()</code>(e.g. GitHub's gist embedding).
 * These are handled properly (yes even if the script loading was defered)
 * and You might even modify the writen HTML content before it gets into
 * Your page.
 *
 * @param args the arguments object or a string in which case it behaves
 * like if <code>{ src: args }</code> was specified as the function args
 *
 * Supported arguments/properties :
 *
 * - src: the script source - absolute HTTP URL or relative to 'base',
 *   this is the only required property
 *
 * - type: the script type, by default 'text/javascript'
 *
 * - base: the URL base - allows relative paths with the 'src' property
 *
 * - defer: set to true to load scripts after DOM is ready otherwise their
 *   going to load while building the DOM (just like regular <script> tags)
 *
 * - order: the order of loading the scripts (makes sense only with defered
 *   loading scripts), e.g. adding a script with order 0 means that it will get
 *   to the 0-th (first) position in the list of scripts waiting to be loaded
 *
 * - loadingHTML: HTML to show in place of the script while not loaded
 *
 * - loaded: callback that gets invoked after the script has loaded this for the
 *   function's scope refers to the script element.
 *   if the loading happened on or after the DOM ready event fired
 *   (with `defer: true`) and the loaded javascript called
 *   `document.write()/writeln()` the argument to the callback
 *   is a string array consisting of all the `write(str)` invocation arguments
 *
 * - complete: callback that gets invoked after the script completed (this in 
 *   general happens after the `loaded` callback)
 *
 * - append: where to append the <script> element, if it's a string an element
 *   with an id is searched and the script is appended as a child of that node,
 *   otherwise it should be a function that receives a script element and
 *   should inject the received node into the DOM
 *
 * NOTE: that the location of the script element is crucial if other elements
 * or HTML using document.write() is generated by the loading script - thus the
 * new content gets injected into the DOM after the script element !
 *
 * To setup default arguments for `script()` use `defaults` :
 * <code>
 *   script.defaults.base  = 'http://gist.github.com';
 *   script.defaults.defer = true;
 * </code>
 *
 * @author Copyright (c) 2010 - Karol Bucek
 * @license http://www.apache.org/licenses/LICENSE-2.0.html
 * @version 0.6-SNAPSHOT
 */
var script = ( function() {
    var DEBUG = true;
    var log = function() {}; // empty fn
    if (DEBUG) {
        log = function() {
            var args = [ '[script.js] ' ].concat( arguments );
            if ( window.console ) {
                console.log.apply( console, args );
            }
            else if ( window.opera ) {
                opera.postError( args.join('') );
            }
            else {
                // NOOP
            }
        };
        // IE8 can't console.log.apply :
        if ( window.console && ! console.firebug ) {
            log = console.log;
        }
    }

    var writes = null;
    var tempDocWrite = function() { // a document.write replacement
        var args = arguments;
        if ( args && args[0] ) {
            log('document.write() args[0] = ', args[0]);
            if ( ! writes ) writes = [];
            writes.push( args[0] );
        }
        else {
            log('document.write() unexpected args = ', args);
        }
    };
    var tempDocWriteln = function(str) { tempDocWrite(str + '\n'); };

    var docWrite, docWriteln; // original document.write / writeln
    function overrideDocWrites() {
        if ( ! docWrite ) docWrite = document.write;
        if ( ! docWriteln ) docWriteln = document.writeln;
        document.write = tempDocWrite;
        document.writeln = tempDocWriteln;
    }
    function restoreDocWrites() {
        if ( docWrite ) document.write = docWrite;
        if ( docWriteln ) document.writeln = docWriteln;
        docWrite = null; docWriteln = null;
    }

    // load the next "script" (element) and invoke callback when done :
    function loadScript(opts, endFunction) {
        log('loadScript() opts = ', opts);
        var loadedCallback = opts.loaded, completeCallback = opts.complete;
        var $script;

        if ( opts.defer ) {
            $script = document.createElement('script');
            $script.src = opts.src;
            if ( opts.type ) $script.type = opts.type;
            if ( opts.charset ) $script.setAttribute('charset', opts.charset);

            var handleScriptLoaded = function() {
                if ( loadedCallback ) {
                    var loadedReturn = loadedCallback.call($script, writes || undefined);
                    if (loadedReturn === false) return;
                }
                var $div = document.getElementById(opts.id); // placeholder
                if ( writes ) { // document.write happened
                    log('handleScriptLoaded() writeArray.len = ', writes.length);
                    //var $scriptSibling = $script.nextSibling;
                    // nodes should get after the <script> tag :
                    var appendNode = function($node) {
                        if ($script.nextSibling) {
                            $script.parentNode.insertBefore($node, $script.nextSibling);
                        }
                        else {
                            $script.parentNode.appendChild($node);
                        }
                    };
                    if ( ! $div ) { // if called after DOM load - it won't exist
                        $div = document.createElement('div');
                        appendNode( $div );
                    }
                    // insert the HTML collected from document.write :
                    $div.style.display = 'none';
                    $div.innerHTML = writes.join('');
                    log('handleScriptLoaded() div.childNodes.length = ', $div.childNodes.length);
                    // the HTML gets after the <script> tag :
                    var $divNode = $div.childNodes[0];
                    while ( $divNode ) {
                        // first remove the node from the $div :
                        $div.removeChild( $divNode );
                        appendNode( $divNode );
                        $divNode = $div.childNodes[0]; // NodeList is live
                    }
                }
                if ( $div ) $div.parentNode.removeChild($div); // was a temporary
                if ( completeCallback ) completeCallback.call($script);
            };
            
            var done = false;
            $script.onload = $script.onreadystatechange = function() {
                if ( ! done && ( ! this.readyState || 
                    this.readyState === "loaded" || this.readyState === "complete" ) ) {
                    done = true;
                    
                    $script.onload = $script.onreadystatechange = null;
                    
                    try { handleScriptLoaded(); }
                    finally { endFunction && endFunction(); } // TODO setTimeout(1) !?!
                    // TODO remove $script ?
                }
            };
            
            opts.append($script); // finally a <script> gets into DOM
        }
        else {
            $script = document.getElementById(opts.id);
            try {
                if ( loadedCallback ) loadedCallback.call($script);
                // here we do not care about the return value
                if ( completeCallback ) completeCallback.call($script);
            }
            finally {
                $script.id = null;
                endFunction && endFunction();
            }
        }
    }
    // a custom list used to store args for which embedGist() has
    // been called (for later processing - when the DOM is ready)
    var scripts = []; // a list of scripts to load
    scripts.yieldNext = function(yield) {
        if ( ! this.next ) this.next = 0;
        log('yieldNext() next = ', this.next);
        var nextElem = this[ this.next++ ]; // the args
        if ( nextElem ) {
            yield( nextElem );
            return true; // yielded
        }
        else {
            log('yieldNext() no next - done !');
            return false; // no yield
        }
    };
    // load all stored gist elements by iterating with loadScript()
    function loadAllScripts() {
        if ( ! scripts ) return; // already loaded or nothing to load
        log('loadAllScripts() scripts.length = ', scripts.length);
        var _scripts = scripts; scripts = null;

        var loadAndYieldNext = function(opts) {
            overrideDocWrites();
            loadScript(opts, function() {
                restoreDocWrites(); writes = null; // clear for next
                _scripts.yieldNext(loadAndYieldNext); // recurse to next
            });
        };
        _scripts.yieldNext(loadAndYieldNext);
    }
    // initialization - after DOM is ready call loadAllScripts() :
    var DOMContentLoaded, load = function() { // a window.onload fallback
        if ( DOMContentLoaded ) { DOMContentLoaded = null; loadAllScripts(); }
    };
    if ( document.addEventListener ) { // "normal" browsers
        DOMContentLoaded = function() {
            document.removeEventListener( "DOMContentLoaded", DOMContentLoaded, false );
            DOMContentLoaded = null; loadAllScripts();
        };
        document.addEventListener( "DOMContentLoaded", DOMContentLoaded, false );
        window.addEventListener( "load", load, false );
     }
     else if ( document.attachEvent ) { // IE crap follows
        DOMContentLoaded = function() {
            if (document.readyState === "complete") { // make sure body exists
                document.detachEvent( "onreadystatechange", DOMContentLoaded );
                DOMContentLoaded = null; loadAllScripts();
            }
        };
        document.attachEvent( "onreadystatechange", DOMContentLoaded );
        window.attachEvent( "onload", load );
        // If IE and not a frame
        // continually check to see if the document is ready
        // http://javascript.nwbox.com/IEContentLoaded/
        var doScrollCheck = function doScrollCheck() {
            if ( ! DOMContentLoaded ) return;
            try { document.documentElement.doScroll("left"); }
            catch(e) { setTimeout( doScrollCheck, 1 ); return; }
            
            loadAllScripts();
        }
        var toplevel = false;
        try { toplevel = window.frameElement == null; } catch(e) {}
        if ( document.documentElement.doScroll && toplevel ) {
            doScrollCheck();
        }
    }
    
    /**
     * The script function itself
     */
    var script = function(args) {
        if ( ! args ) throw 'script : no arguments given';
        if ( typeof args === "string" ) args = { src: args };
        else {
            if ( ! args.src ) throw "script : 'src' is required";
        }

        var name, opts = {}, defs = script.defaults;
        if ( defs ) for ( name in defs ) opts[name] = defs[name];
        for ( name in args ) opts[name] = args[name];
        // complete some of the provided arguments :
        if ( opts.base && opts.src.substring(0, 4) !== 'http' ) {
            var base = opts.base, last = opts.base.length - 1;
            base = base[last] == '/' ? base.substring(0, last) : base;
            opts.src = base + '/' + opts.src;
        }

        // @todo support charset option !

        // onload option is @deprecated
        if ( opts.onload != null ) { // normalize onload -> onLoad
            if ( opts.onLoad != null ) {
                // make sure defs.onload does not overwrite args.onLoad :
                if ( args.onload != null ) opts.onLoad = args.onload;
                else if ( args.onLoad != null ) opts.onLoad = args.onLoad;
                else opts.onLoad = opts.onload;
            }
            else {
                opts.onLoad = opts.onload;
            }
            delete opts.onload;
        }
        if ( typeof(opts.defer) === 'undefined' ) opts.defer = opts.onLoad;

        if ( ! opts.id ) opts.id = script._generateId();

        var append = opts.append;
        if ( typeof append === "string" ) { // treat as Node ID
            opts.append = function($script) {
                var $append = document.getElementById(append);
                $append.appendChild($script);
            }
        }
        else if ( append && append.appendChild ) { // Node itself
            opts.append = function($script) {
                append.appendChild($script);
            }
        }

        // loadFunc is null after DOM load event already occured :
        if ( DOMContentLoaded ) {
            var content = '';
            if ( opts.defer ) {
                content = '<div id="'+ opts.id +'"';
                if ( opts.loadingHTML ) content += ('>' + opts.loadingHTML);
                else content += ' style="diplay: none;">';
                content += '</div>'; // no <script> yet - only a <div>
                if ( ! opts.append ) {
                    opts.append = function($script) {
                        var $div = document.getElementById(opts.id);
                        $div.parentNode.insertBefore($script, $div);
                    }
                }
            }
            else {
                content = '<script id="'+ opts.id +'" src="'+ opts.src +'"><\/script>';
            }
            document.write(content); // ok as we're still building the DOM
            var order = opts.order;
            if (order == null) scripts.push( opts );
            else scripts.splice( order, 0, opts );
        }
        else { // DOM load already happened
            opts.defer = true; // doesn't make sense to be false
            if ( ! opts.append ) {
                opts.append = function(script) {
                    var $elem = document.getElementsByTagName('body')[0];
                    $elem.appendChild(script);
                }
            }
            overrideDocWrites();
            loadScript(opts, function() {
                restoreDocWrites();
                writes = null; // clear it for next iteration
            }); // immediately - document load already happened
        }
        //if ( scripts ) scripts.push( opts );
        //else loadScript(opts);
    }

    var uid = 0;
    script._generateId = function() { // default _generateId fn
        return '_script-' + ( uid++ );
    };

    script.defaults = { // default options
        type: 'text/javascript'
    };

    return script;

})();