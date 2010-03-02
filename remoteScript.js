/***
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
 * - src: the script source - absolute HTTP URL or relative to 'base',
 *   this is the only required property
 * - base: the URL base - allows relative paths with the 'src' property
 * - onLoad: set to true to load scripts after DOM is ready otherwise
 *   their going to load while building the DOM
 * - loadingHTML: HTML to show in place of the script while not loaded
 *
 * To setup default arguments for remoteScript() use the defaults object :
 * <code>
 *   remoteScript.defaults.onLoad = true;
 *   remoteScript.defaults.base = 'http:\/\/gist.github.com';
 * </code>
 *
 * @author Copyright (c) 2010 - Karol Bucek
 * @license http://www.apache.org/licenses/LICENSE-2.0.html
 * @version 0.1
 */
var remoteScript = ( function() {
    function log() { // a logging helper
        var debug = false;
        try {
            if ( debug && console ) console.log(arguments);
        } catch (e) { /* */ }
    }
    var writeArray = null;
    function pushToWriteArray() { // a document.write replacement
        var args = arguments;
        if ( args && args[0] ) {
            log('document.write() args[0] = ', args[0]);
            if ( ! writeArray ) writeArray = [];
            writeArray.push( args[0] );
        }
        else {
            log('document.write() unexpected args = ', args);
        }
    }
    // load the next "script" (element) and invoke callback when done :
    function loadScript(opts, doneCallback) {
        log('loadScript() opts = ', opts);
        var scriptLoaded = opts.scriptLoaded, $script;
        
        if ( opts.onLoad ) {
            $script = document.createElement('script');
            $script.setAttribute('src', opts.src);

            var handleScriptLoaded = function() {
                if ( scriptLoaded ) scriptLoaded($script, writeArray || undefined);
                if ( writeArray ) { // document.write happened
                    log('handleScriptLoaded() writeArray.len = ', writeArray.length);
                    var $scriptSibling = $script.nextSibling;
                    // nodes should get after the <script> tag :
                    var appendNode = function($node) {
                        if ( $scriptSibling ) {
                            $script.parentNode.insertBefore($node, $scriptSibling);
                        }
                        else {
                            $script.parentNode.appendChild($node);
                        }
                    };
                    var $div = document.getElementById(opts.id); // placeholder
                    if ( ! $div ) { // if called after DOM load - it won't exist
                        $div = document.createElement('div');
                        appendNode( $div );
                    }
                    // insert the HTML collected from document.write :
                    $div.style.display = 'none';
                    $div.innerHTML = writeArray.join('');
                    // the HTML gets after the <script> tag :
                    while ( $div.childNodes[0] ) { // as NodeList is live
                        //$div.parentNode.insertBefore($div.childNodes[0], $div);
                        appendNode( $div.childNodes[0] );
                    }
                    $div.parentNode.removeChild($div); // was a temporary
                }
            };

            if ($script.readyState) { // IE
                $script.onreadystatechange = function() {
                    if ($script.readyState == "loaded" ||
                        $script.readyState == "complete") {
                        $script.onreadystatechange = null;
                        handleScriptLoaded();
                        if ( doneCallback ) doneCallback();
                    }
                };
            }
            else { // non-IE
                $script.onload = function() {
                    handleScriptLoaded();
                    if ( doneCallback ) doneCallback();
                };
            }
            // finally a <script> gets into DOM
            opts.appendScript($script);
        }
        else {
            $script = document.getElementById(opts.id);
            if ( scriptLoaded ) scriptLoaded($script);
            if ( doneCallback ) doneCallback();
        }
    }
    // a custom list used to store args for which embedGist() has
    // been called (for later processing - when the DOM is ready)
    var scriptList = []; // a list of remote scripts
    scriptList.yieldNext = function(yield) {
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
        if ( ! scriptList ) return; // already loaded or nothing to load
        log('scriptList() scriptList.len = ', scriptList.length);
        var scriptListCopy = scriptList;scriptList = null;

        var documentWrite = document.write;
        var loadAndYieldNext = function(opts) {
            document.write = pushToWriteArray;
            loadScript(opts, function() {
                document.write = documentWrite; // restore document.write
                scriptListCopy.yieldNext(loadAndYieldNext); // recurse to next
                writeArray = null; // clear it for next iteration
            });
        };
        scriptListCopy.yieldNext(loadAndYieldNext);
    }
    // initialization - after DOM is ready call loadAllScripts() :
    var loadFunc;
    if ( document.addEventListener ) { // non-IE
        loadFunc = function() {
            document.removeEventListener("DOMContentLoaded", loadFunc, false);
            loadAllScripts();loadFunc = null;
        };
        document.addEventListener("DOMContentLoaded", loadFunc, false);
     }
     else if ( document.attachEvent ) { // IE
        loadFunc = function() {
            if (document.readyState === "complete") { // make sure body exists
                document.detachEvent( "onreadystatechange", loadFunc );
                loadAllScripts();loadFunc = null;
            }
        };
        document.attachEvent("onreadystatechange", loadFunc);
    }
    
    function remoteScript(args) { // the remoteScript itself
        if ( ! args ) throw 'no arguments given';
        if ( typeof args === "string" ) {
            args = {src: args};
        }
        else {
            if ( ! args.src ) throw "'src' is required";
        }
        
        var name, opts = {}, defs = remoteScript.defaults;
        if ( defs ) for ( name in defs ) opts[name] = defs[name];
        for ( name in args ) opts[name] = args[name];
        // complete some of the provided arguments :
        if ( opts.base && opts.src.substring(0, 4) != 'http' ) {
            var base = opts.base, last = opts.base.length - 1;
            base = base[last] == '/' ? base.substring(0, last) : base;
            opts.src = base + '/' + opts.src;
        }
        if ( ! opts.id ) { // generate one :
            var id = opts.src;
            id = id.substring(id.lastIndexOf('/') + 1).replace('.', '_');
            opts.id = id + '-' + (new Date()).getTime();
        }
        var appendElem = opts.appendScript;
        if ( typeof appendElem === "string" ) {
            opts.appendScript = function(script) {
                var $elem = document.getElementById(appendElem);
                $elem.appendChild(script);
            }
        }
        else if ( appendElem && appendElem.appendChild ) { // Node
            opts.appendScript = function(script) { appendElem.appendChild(script); }
        }

        // loadFunc is null after DOM load event already occured :
        if ( loadFunc ) {
            var content = '';
            if ( opts.onLoad ) {
                content = '<div id="'+ opts.id +'"';
                if ( opts.loadingHTML ) content += ('>' + opts.loadingHTML);
                else content += ' style="diplay: none;">';
                content += '</div>'; // no <script> yet - only a <div>
                if ( ! opts.appendScript ) {
                    opts.appendScript = function(script) {
                        var $div = document.getElementById(opts.id);
                        $div.parentNode.insertBefore(script, $div);
                    }
                }
            }
            else {
                content = '<script id="'+ opts.id +'" src="'+ opts.src +'"><\/script>';
            }
            document.write(content); // ok as we're still building the DOM
            scriptList.push( opts );
        }
        else {
            opts.onLoad = true; // doesn't make sense to be false
            if ( ! opts.appendScript ) {
                opts.appendScript = function(script) {
                    var $elem = document.getElementsByTagName('body')[0];
                    $elem.appendChild(script);
                }
            }
            var documentWrite = document.write;
            document.write = pushToWriteArray;
            loadScript(opts, function() {
                document.write = documentWrite; // restore document.write
                writeArray = null; // clear it for next iteration
            }); // immediately - onload already happened
        }
        //if ( scriptList ) scriptList.push( opts );
        //else loadScript(opts);
    }
    // default options :
    remoteScript.defaults = {};
    
    return remoteScript;
    
})();