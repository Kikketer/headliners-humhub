/**
 * Manages the client/server communication. Handles humhub json api responses and
 * pjax requests.
 */
humhub.module('client', function(module, require, $) {
    var object = require('util').object;
    var event = require('event');

    /**
     * Response Wrapper Object for easily accessing common data
     */
    var Response = function(xhr, url, textStatus, dataType) {
        this.url = url;
        this.status = xhr.status;
        this.response = xhr.responseJSON || xhr.responseText;
        //Textstatus = "timeout", "error", "abort", "parsererror", "application"
        this.textStatus = textStatus;
        this.dataType = dataType;

        if(!dataType || dataType === 'json') {
            $.extend(this, this.response);
        } else if(dataType) {
            this[dataType] = this.response;
        }
    };

    Response.prototype.setSuccess = function(data) {
        this.data = data;
        return this;
    };

    Response.prototype.setError = function(errorThrown) {
        this.error = errorThrown;
        this.validationError = (this.status === 400);
        return this;
    };

    Response.prototype.isError = function() {
        return this.status >= 400;
    };

    Response.prototype.getLog = function() {
        var result = $.extend({}, this);

        if(this.response && object.isString(this.response)) {
            result.response = this.response.substr(0, 500)
            result.response += (this.response.length > 500) ? '...' : '';
        }
        ;

        if(this.html && object.isString(this.html)) {
            result.html = this.html.substr(0, 500)
            result.html += (this.html.length > 500) ? '...' : '';
        }
        ;

        return result;
    };

    var submit = function($form, cfg, originalEvent) {
        if($form instanceof $.Event && $form.$form) {
            originalEvent = $form;
            $form = $form.$form;
        } else if($form instanceof $.Event && $form.$trigger) {
            originalEvent = $form;
            $form = $form.$trigger.closest('form');
        } else if(cfg instanceof $.Event) {
            originalEvent = cfg;
            cfg = {};
        } 

        cfg = cfg || {};
        $form = object.isString($form) ? $($form) : $form;

        if(!$form || !$form.length) {
            return Promise.reject('Could not determine form for submit action.');
        }

        cfg.type = $form.attr('method') || 'post';
        cfg.data = $form.serialize();
        var url = cfg.url || originalEvent.url || $form.attr('action');
        return ajax(url, cfg, originalEvent);
    };

    var post = function(url, cfg, originalEvent) {
        if(url instanceof $.Event) {
            originalEvent = url;
            url = originalEvent.url;
        } else if(cfg instanceof $.Event) {
            originalEvent = cfg;
            cfg = {};
        } else if(!object.isString(url)) {
            cfg = url;
            url = cfg.url;
        }

        cfg = cfg || {};
        cfg.type = cfg.method = 'POST';
        return ajax(url, cfg, originalEvent);
    };

    var html = function(url, cfg, originalEvent) {
        if(url instanceof $.Event) {
            originalEvent = url;
            url = originalEvent.url;
        } else if(cfg instanceof $.Event) {
            originalEvent = cfg;
            cfg = {};
        } else if(!object.isString(url)) {
            cfg = url;
            url = cfg.url;
        }

        cfg = cfg || {};
        cfg.type = cfg.method = 'GET';
        cfg.dataType = 'html';
        return get(url, cfg, originalEvent);
    };

    var get = function(url, cfg, originalEvent) {
        if(url instanceof $.Event) {
            originalEvent = url;
            url = originalEvent.url;
        } else if(cfg instanceof $.Event) {
            originalEvent = cfg;
            cfg = {};
        } else if(!object.isString(url)) {
            cfg = url;
            url = cfg.url;
        }

        cfg = cfg || {};
        cfg.type = cfg.method = 'GET';
        return ajax(url, cfg, originalEvent);
    };

    var ajax = function(url, cfg, originalEvent) {

        // support for ajax(url, event) and ajax(path, successhandler);
        if(cfg instanceof $.Event) {
            originalEvent = cfg;
            cfg = {};
        } else if(object.isFunction(cfg)) {
            cfg = {'success': cfg};
        }


        var promise = new Promise(function(resolve, reject) {
            cfg = cfg || {};

            var errorHandler = cfg.error;
            var error = function(xhr, textStatus, errorThrown) {
                var response = new Response(xhr, url, textStatus, cfg.dataType).setError(errorThrown);

                if(errorHandler && object.isFunction(errorHandler)) {
                    errorHandler(response);
                }

                finish(originalEvent);
                reject(response);
            };

            var successHandler = cfg.success;
            var success = function(data, textStatus, xhr) {
                var response = new Response(xhr, url, textStatus, cfg.dataType).setSuccess(data);
                if(successHandler) {
                    successHandler(response);
                }

                finish(originalEvent);
                resolve(response);

                // Other modules can register global handler by the response type given by the backend.
                // For example {type:'modal', 'content': '...')
                if(response.type) {
                    event.trigger('humhub:modules:client:response:' + response.type);
                }

                promise.done(function() {
                    // If content with <link> tags are inserted in resolve, the ajaxComplete handler in yii.js
                    // makes sure redundant stylesheets are removed. Here we make sure it is called after inserting the response.
                    $(document).trigger('ajaxComplete');
                });
            };

            //Overwriting the handler with our wrapper handler
            cfg.success = success;
            cfg.error = error;
            cfg.url = url;

            //Setting some default values
            cfg.dataType = cfg.dataType || "json";

            $.ajax(cfg);
        });

        promise.status = function(setting) {
            return new Promise(function(resolve, reject) {
                promise.then(function(response) {
                    try {
                        if(setting[response.status]) {
                            setting[response.status](response);
                        }
                        resolve(response);
                    } catch(e) {
                        reject(e);
                    }
                }).catch(function(response) {
                    try {
                        if(setting[response.status]) {
                            setting[response.status](response);
                            resolve(response);
                        } else {
                            reject(response);
                        }
                    } catch(e) {
                        reject(e);
                    }
                });
            });
        };

        return promise;
    };

    var finish = function(originalEvent) {
        if(originalEvent && object.isFunction(originalEvent.finish) && originalEvent.block !== 'manual') {
            originalEvent.finish();
        }
    };

    module.export({
        ajax: ajax,
        post: post,
        get: get,
        html: html,
        submit: submit,
        //upload: upload,
        Response: Response
    });
});

/**
 * 
 var handleResponse = function (json, callback) {
 var response = new Response(json);
 if (json.content) {
 response.$content = $('<div>' + json.content + '</div>');
 
 //Find all remote scripts and remove them from the partial
 var scriptSrcArr = [];
 response.$content.find('script[src]').each(function () {
 scriptSrcArr.push($(this).attr('src'));
 $(this).remove();
 });
 
 //Load the remote scripts synchronously only if they are not already loaded.
 scripts.loadOnceSync(scriptSrcArr, function () {
 callback(response);
 });
 } else {
 callback(response);
 }
 };
 */