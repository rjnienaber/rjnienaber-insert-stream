using System;
using System.IO;
using System.Text;
using System.Web;
using Moq;
using NUnit.Framework;
using MvcMiniProfiler.Filter;

namespace MvcMiniProfiler.Tests.Filter
{
    [TestFixture]
    public class EndOfHeadTests : TestContainer
    {
        private Mock<HttpResponseBase> _response;
        private InsertMarkupFilter _stream;
        private MemoryStream _memoryStream;

        
        public override void Setup()
        {
            _response = Factory.Create<HttpResponseBase>();
            _memoryStream = new MemoryStream();
            _response.Setup(r => r.Filter).Returns(_memoryStream);
            _response.Setup(r => r.ContentEncoding).Returns(Encoding.UTF8);
            _stream = new InsertMarkupFilter(_response.Object);
        }

        [Test]
        public void Should_Correctly_Insert_Text_For_Html_Page()
        {
            var eofDetected = false;
            _stream.EndOfHeadDetected += (s) => { eofDetected = true; s.Write("<div>my Information</div>"); };

            Action<string> writeBytes = t =>
            {
                var bytes = Encoding.UTF8.GetBytes(t);
                _stream.Write(bytes, 0, bytes.Length);
            };

            writeBytes("<html><he");
            writeBytes("ad>");
            writeBytes("<ti");
            writeBytes("tle>My Html</title></h");
            writeBytes("ead><body><d");
            writeBytes("iv>Header</div>");
            writeBytes("<div>Content</div><div>footer</div>");
            writeBytes("</body></html>");

            string expectedhtml = "<html><head><title>My Html</title><div>my Information</div></head><body><div>Header</div><div>Content</div><div>footer</div>" +
                                  "</body></html>";


            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo(expectedhtml));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Head()
        {
            var eofDetected = false;
            _stream.EndOfHeadDetected += (s) => { eofDetected = true; };

            var bytes = Encoding.UTF8.GetBytes("</head><body>");
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</head><body>"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Write_Data_After_End_Of_Head()
        {
            var eofDetected = false;
            _stream.EndOfHeadDetected += (s) => { eofDetected = true; };

            var bytes = Encoding.UTF8.GetBytes("</head><body><!--- Other data -->");
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</head><body><!--- Other data -->"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Head_With_Space()
        {
            var eofDetected = false;
            _stream.EndOfHeadDetected += (s) => { eofDetected = true; };

            var bytes = Encoding.UTF8.GetBytes("</head> \r \n \r  <body>");
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</head> \r \n \r  <body>"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Head_With_Space_Ignoring_Case()
        {
            var eofDetected = false;
            _stream.EndOfHeadDetected += (s) => { eofDetected = true; };

            var bytes = Encoding.UTF8.GetBytes("</Head> \r\n  \r  </bOdy>");
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</Head> \r\n  \r  </bOdy>"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Head_With_Space_Ignoring_Case_And_Other_Text()
        {
            var eofDetected = false;
            _stream.EndOfHeadDetected += (s) => { eofDetected = true; s.Write("<myDiv>"); };

            var bytes = Encoding.UTF8.GetBytes("as<div>dfa</div>sdfsdf</head>     <Body>");
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("as<div>dfa</div>sdfsdf<myDiv></head>     <Body>"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Head_Across_Writes()
        {
            var eofDetected = false;
            _stream.EndOfHeadDetected += (s) => { eofDetected = true; };

            Action<string> writeBytes = t =>
            {
                var bytes = Encoding.UTF8.GetBytes(t);
                _stream.Write(bytes, 0, bytes.Length);
            };

            writeBytes("</head>");
            writeBytes("<body>");

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</head><body>"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Head_Across_Writes_And_Tag_Boundaries()
        {
            var eofDetected = false;
            _stream.EndOfHeadDetected += (s) => { eofDetected = true; };

            Action<string> writeBytes = t =>
            {
                var bytes = Encoding.UTF8.GetBytes(t);
                _stream.Write(bytes, 0, bytes.Length);
            };

            writeBytes("</he");
            writeBytes("ad><b");
            writeBytes("ody>");

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</head><body>"));

            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Write_Any_Data_Directly_To_The_Stream()
        {
            var originalText = "abcdefghi؎";
            var bytes = Encoding.UTF8.GetBytes(originalText);

            var eofDetected = false;
            _stream.EndOfHeadDetected += (s) => { eofDetected = true; };

            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());

            Assert.That(originalStreamContent, Is.EqualTo(originalText));
            Assert.IsFalse(eofDetected);
        }

        [Test]
        public void Should_Not_Write_Any_Data_When_Possible_End_Of_Head()
        {
            var originalText = "abcdefghi</Hea";
            var bytes = Encoding.UTF8.GetBytes(originalText);

            var eofDetected = false;
            _stream.EndOfHeadDetected += (s) => { eofDetected = true; };

            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());

            Assert.That(originalStreamContent, Is.EqualTo("abcdefghi"));
            Assert.IsFalse(eofDetected);

            bytes = Encoding.UTF8.GetBytes("d></BoDy>");

            _stream.Write(bytes, 0, bytes.Length);

            originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());

            Assert.That(originalStreamContent, Is.EqualTo("abcdefghi</Head></BoDy>"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Insert_Text_Correctly_Into_Mvc_Test_Page()
        {
            string html = ReadTestData("Filter.mvcTestPage.html");

            var eofDetected = false;
            _stream.EndOfHeadDetected += (s) => { eofDetected = true; };

            var bytes = Encoding.UTF8.GetBytes(html);
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo(html));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Head_After_Script_Tag()
        {
            var eofDetected = false;
            _stream.EndOfHeadDetected += (s) => { eofDetected = true; };

            Action<string> writeBytes = t =>
            {
                var bytes = Encoding.UTF8.GetBytes(t);
                _stream.Write(bytes, 0, bytes.Length);
            };

            writeBytes("</sc");
            writeBytes("ript></h");
            writeBytes("ead>");

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</script></head>"));

            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Not_Signal_End_Of_Head_Twice()
        {
            int signalCount = 0;
            _stream.EndOfHeadDetected += (s) => { signalCount++; };

            var bytes = Encoding.UTF8.GetBytes("</head></head></body>");
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</head></head></body>"));
            Assert.That(signalCount, Is.EqualTo(1));
        }
    }

}
