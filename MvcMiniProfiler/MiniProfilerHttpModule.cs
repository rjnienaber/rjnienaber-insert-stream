using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Web;
using MvcMiniProfiler.Filter;
using System.IO;

namespace MvcMiniProfiler
{
    public class MiniProfilerHttpModule : IHttpModule
    {
        public void Dispose()
        {
            
        }

        public void Init(HttpApplication context)
        {
            context.ReleaseRequestState += ReleaseRequestState;
        }

        public void ReleaseRequestState(object sender, EventArgs e)
        {
            var context = HttpContext.Current;
            var response = context.Response;
            if (response.ContentType != "text/html" || IsARedirect(response))
                return;

            var filter = InsertMarkupFilter.InterceptResponse(response);
            filter.EndOfBodyDetected += writer => writer.Write(MiniProfiler.RenderIncludes().ToHtmlString());
        }

        bool IsARedirect(HttpResponse response)
        {
            return response.StatusCode == 301 || response.StatusCode == 302;
        }
    }
}
